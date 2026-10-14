-- WABA inbox: acknowledge only after durable storage. Existing message IDs
-- remain succeeded receipts and are never replayed by this migration.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

alter table public.webhook_message_ids
  add column if not exists phone text,
  add column if not exists payload jsonb,
  add column if not exists contact_name text,
  add column if not exists received_at timestamptz,
  add column if not exists state text not null default 'succeeded',
  add column if not exists lease_token uuid,
  add column if not exists lease_until timestamptz,
  add column if not exists attempts integer not null default 0,
  add column if not exists next_attempt_at timestamptz not null default now();
alter table public.webhook_message_ids alter column processed_at drop not null;
alter table public.webhook_message_ids
  add constraint webhook_message_ids_state_check
  check (state in ('queued', 'preparing', 'dispatching', 'succeeded', 'failed'));
alter table public.webhook_message_ids
  add constraint webhook_message_ids_active_payload_check
  check (state = 'succeeded' or (phone is not null and payload is not null and received_at is not null));
create index if not exists webhook_message_ids_pending_idx
  on public.webhook_message_ids (next_attempt_at, received_at, message_id)
  where state in ('queued', 'preparing');
create index if not exists webhook_message_ids_phone_pending_idx
  on public.webhook_message_ids (phone, received_at, message_id)
  where state in ('queued', 'preparing', 'dispatching');
create index if not exists webhook_message_ids_processed_idx
  on public.webhook_message_ids (processed_at)
  where state = 'succeeded';

create or replace function public.zelo_waba_claim()
returns table(message_id text, payload jsonb, contact_name text, received_at timestamptz, lease_token uuid)
language plpgsql set search_path = public, pg_temp as $$
begin
  -- A crash on the fifth preparation attempt must become visible and must
  -- not block the same contact's later messages forever.
  update public.webhook_message_ids
  set state = 'failed', lease_token = null, lease_until = null
  where state = 'preparing' and attempts >= 5 and lease_until <= statement_timestamp();
  return query
  with candidate as (
    select w.message_id
    from public.webhook_message_ids w
    where w.payload is not null
      and w.attempts < 5
      and ((w.state = 'queued' and w.next_attempt_at <= statement_timestamp())
        or (w.state = 'preparing' and w.lease_until <= statement_timestamp()))
      and not exists (
        select 1 from public.webhook_message_ids older
        where older.phone = w.phone
          and older.message_id <> w.message_id
          and (older.received_at, older.message_id) < (w.received_at, w.message_id)
          and (older.state in ('queued', 'preparing')
            or (older.state = 'dispatching' and older.lease_until > statement_timestamp()))
      )
    order by w.received_at, w.message_id
    limit 1 for update of w skip locked
  )
  update public.webhook_message_ids w
  set state = 'preparing', lease_token = gen_random_uuid(),
      lease_until = statement_timestamp() + interval '5 minutes', attempts = w.attempts + 1
  from candidate c where w.message_id = c.message_id
  returning w.message_id, w.payload, w.contact_name, w.received_at, w.lease_token;
end;
$$;

create or replace function public.zelo_waba_begin_dispatch(p_message_id text, p_lease_token uuid)
returns boolean language plpgsql set search_path = public, pg_temp as $$
declare changed integer;
begin
  update public.webhook_message_ids
  set state = 'dispatching', lease_until = statement_timestamp() + interval '10 minutes'
  where message_id = p_message_id and lease_token = p_lease_token
    and state = 'preparing' and lease_until > statement_timestamp();
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

create or replace function public.zelo_waba_finish(p_message_id text, p_lease_token uuid, p_outcome text)
returns boolean language plpgsql set search_path = public, pg_temp as $$
declare changed integer;
begin
  if p_outcome not in ('succeeded', 'retry', 'failed') then return false; end if;
  update public.webhook_message_ids
  set state = case
      when p_outcome = 'retry' and attempts < 5 then 'queued'
      when p_outcome = 'retry' then 'failed'
      else p_outcome end,
    processed_at = case when p_outcome = 'succeeded' then statement_timestamp() else processed_at end,
    payload = case when p_outcome = 'succeeded' then null else payload end,
    contact_name = case when p_outcome = 'succeeded' then null else contact_name end,
    lease_token = null,
    lease_until = null,
    next_attempt_at = case when p_outcome = 'retry'
      then statement_timestamp() + make_interval(secs => least(300, 10 * power(2, least(attempts, 5))::integer))
      else next_attempt_at end
  where message_id = p_message_id and lease_token = p_lease_token
    and (state = 'preparing' or (state = 'dispatching' and p_outcome <> 'retry'));
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

create or replace function public.zelo_waba_inbox_attention_count()
returns integer language sql stable set search_path = public, pg_temp as $$
  select count(*)::integer from public.webhook_message_ids
  where state = 'failed' or (state = 'dispatching' and lease_until < statement_timestamp());
$$;

create or replace function public.zelo_waba_cleanup()
returns integer language plpgsql set search_path = public, pg_temp as $$
declare removed integer;
begin
  delete from public.webhook_message_ids where message_id in (
    select message_id from public.webhook_message_ids
    where state = 'succeeded' and processed_at < statement_timestamp() - interval '7 days'
    order by processed_at limit 2000
  );
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.zelo_waba_claim(), public.zelo_waba_begin_dispatch(text,uuid),
  public.zelo_waba_finish(text,uuid,text), public.zelo_waba_inbox_attention_count(), public.zelo_waba_cleanup()
  from public, anon, authenticated;
grant execute on function public.zelo_waba_claim(), public.zelo_waba_begin_dispatch(text,uuid),
  public.zelo_waba_finish(text,uuid,text), public.zelo_waba_inbox_attention_count(), public.zelo_waba_cleanup()
  to service_role;
commit;
