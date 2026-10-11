begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

alter table open_finance.connections
  add column retirement_requested_at timestamptz,
  add column retirement_attempts integer not null default 0 check(retirement_attempts>=0),
  add column retirement_next_attempt_at timestamptz not null default now(),
  add column retirement_lease_token uuid,
  add column retirement_lease_until timestamptz,
  add column retirement_error_code text check(retirement_error_code ~ '^[A-Z_0-9]{1,80}$');
create index connections_retirement_idx on open_finance.connections(retirement_next_attempt_at,id) where environment='production' and status<>'revoked';

create table open_finance.retirement_health(singleton boolean primary key default true check(singleton),last_seen_at timestamptz not null);
alter table open_finance.retirement_health enable row level security;
revoke all on open_finance.retirement_health from public,anon,authenticated,service_role;

-- The same transaction that disables Zelo access stops local bank imports.
create function open_finance.retire_disabled_user() returns trigger
language plpgsql security definer set search_path=pg_catalog set row_security=off as $$
begin
  if new.status is distinct from 'active' and old.status is distinct from new.status then
    update open_finance.connections set status='revoking',retirement_requested_at=coalesce(retirement_requested_at,now()),retirement_next_attempt_at=least(retirement_next_attempt_at,now()),updated_at=now()
      where user_id=new.id and environment='production' and status not in ('revoked','revoking');
  end if;
  return new;
end $$;
revoke all on function open_finance.retire_disabled_user() from public,anon,authenticated,service_role;
create trigger zelo_retire_disabled_user after update of status on public.users for each row execute function open_finance.retire_disabled_user();

-- Preserve both the cancellation queue and customer history from cascading deletes.
create function open_finance.protect_customer_history() returns trigger
language plpgsql security definer set search_path=pg_catalog set row_security=off as $$
begin
  if exists(select 1 from open_finance.connections where user_id=old.id) then raise exception 'OF_CLIENT_HISTORY_PROTECTED'; end if;
  return old;
end $$;
revoke all on function open_finance.protect_customer_history() from public,anon,authenticated,service_role;
create trigger zelo_protect_customer_bank_history before delete on public.users for each row execute function open_finance.protect_customer_history();

-- Catch existing inactive customers, including status changes made before deployment.
update open_finance.connections c set status='revoking',retirement_requested_at=coalesce(c.retirement_requested_at,now()),updated_at=now()
  from public.users u where u.id=c.user_id and u.status is distinct from 'active' and c.environment='production' and c.status not in ('revoked','revoking');

create function public.zelo_of_claim_retirement() returns jsonb
language plpgsql security definer set search_path=pg_catalog set row_security=off as $$
declare c open_finance.connections;
begin
  insert into open_finance.retirement_health values(true,now()) on conflict(singleton) do update set last_seen_at=now();
  -- Recheck current users too: an in-flight create may finish after deactivation.
  select x.* into c from open_finance.connections x join public.users u on u.id=x.user_id
    where x.environment='production' and x.status<>'revoked' and (x.status='revoking' or u.status is distinct from 'active')
    and x.retirement_next_attempt_at<=now() and (x.retirement_lease_until is null or x.retirement_lease_until<now())
    order by x.retirement_next_attempt_at,x.id for update of x,u skip locked limit 1;
  if c.id is null then return null; end if;
  update open_finance.connections set status='revoking',retirement_requested_at=coalesce(retirement_requested_at,now()),retirement_attempts=retirement_attempts+1,retirement_lease_token=gen_random_uuid(),retirement_lease_until=now()+interval '2 minutes',updated_at=now()
    where id=c.id returning * into c;
  return jsonb_build_object('id',c.id,'user_id',c.user_id,'external_consent_id',c.external_consent_id,'retirement_lease_token',c.retirement_lease_token);
end $$;

create function public.zelo_of_finish_retirement(p_id uuid,p_lease uuid,p_error text,p_provider_status text) returns void
language plpgsql security definer set search_path=pg_catalog set row_security=off as $$
declare c open_finance.connections;
begin
  select * into c from open_finance.connections where id=p_id and environment='production' for update;
  if c.id is null or p_lease is null or c.retirement_lease_token is distinct from p_lease or c.retirement_lease_until is null or c.retirement_lease_until<now() then raise exception 'OF_LEASE_INVALID'; end if;
  if p_error is not null and p_error !~ '^[A-Z_0-9]{1,80}$' then raise exception 'OF_ERROR_INVALID'; end if;
  if p_error is null and (p_provider_status is null or p_provider_status not in ('REVOKED','EXPIRED','REJECTED')) then raise exception 'OF_CANCELLATION_UNCONFIRMED'; end if;
  if c.status not in ('revoking','revoked') then raise exception 'OF_CONSENT_INACTIVE'; end if;
  update open_finance.connections set
    status=case when p_error is null then 'revoked' else status end,
    provider_status=case when p_error is null and status<>'revoked' then p_provider_status else provider_status end,
    revoked_at=case when p_error is null then coalesce(revoked_at,now()) else revoked_at end,
    retirement_error_code=case when status='revoked' then null else p_error end,
    retirement_next_attempt_at=now()+make_interval(secs=>least(1800,30*power(2,least(retirement_attempts,6)))::integer),
    retirement_lease_token=null,retirement_lease_until=null,updated_at=now() where id=c.id;
end $$;
revoke all on function public.zelo_of_claim_retirement(),public.zelo_of_finish_retirement(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.zelo_of_claim_retirement(),public.zelo_of_finish_retirement(uuid,uuid,text,text) to service_role;
commit;
