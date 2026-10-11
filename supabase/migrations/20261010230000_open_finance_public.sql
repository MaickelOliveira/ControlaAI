begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

alter table open_finance.user_access add column if not exists country_confirmation_source text not null default 'operator_verified';
create table open_finance.worker_health(mode text primary key check(mode in ('personal','business')),last_seen_at timestamptz not null);
alter table open_finance.worker_health enable row level security;
alter table open_finance.worker_health force row level security;
revoke all on open_finance.worker_health from public,anon,authenticated,service_role;

-- Availability is not bank consent: each holder confirms a Brazilian bank account.
create function public.zelo_of_enable_brazil(p_user uuid,p_mode text,p_country text,p_confirmed boolean) returns boolean
language plpgsql security definer set search_path=pg_catalog set row_security=off as $$
begin
  if p_country is distinct from 'BR' or p_confirmed is distinct from true then raise exception 'OF_COUNTRY_INVALID'; end if;
  if p_mode is null or p_mode not in ('personal','business') then raise exception 'OF_SCOPE_INVALID'; end if;
  if not exists(select 1 from public.users where id=p_user and status='active' and (p_mode='personal' or plan='business')) then raise exception 'OF_ACCESS_DENIED'; end if;
  insert into open_finance.user_access(user_id,country_code,country_verified_at,enabled,country_confirmation_source)
  values(p_user,'BR',now(),true,'holder_brazilian_bank_2026_10') on conflict(user_id) do nothing;
  if not exists(select 1 from open_finance.user_access where user_id=p_user and enabled and country_code='BR' and country_verified_at is not null) then raise exception 'OF_ACCESS_DISABLED'; end if;
  return true;
end $$;

-- The signature is checked by the HTTP handler before this server-only lookup.
-- No identity supplied by the webhook is trusted; local ownership is authoritative.
create function public.zelo_of_event_target(p_reference text,p_family text) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog set row_security=off as $$
declare matches integer; target record;
begin
  if length(p_reference)>200 then raise exception 'OF_REFERENCE_INVALID'; end if;
  if p_family='consents' then
    select count(*) into matches from open_finance.connections where environment='production' and external_consent_id=p_reference;
    select id,user_id,mode,status into target from open_finance.connections where environment='production' and external_consent_id=p_reference;
  else
    select count(distinct c.id) into matches from open_finance.connections c join open_finance.resources r on r.connection_id=c.id where c.environment='production' and r.external_id=p_reference and r.subtype=p_family;
    select distinct c.id,c.user_id,c.mode,c.status into target from open_finance.connections c join open_finance.resources r on r.connection_id=c.id where c.environment='production' and r.external_id=p_reference and r.subtype=p_family;
  end if;
  if matches=0 then return null; end if;
  if matches<>1 then raise exception 'OF_TARGET_AMBIGUOUS'; end if;
  return jsonb_build_object('id',target.id,'userId',target.user_id,'mode',target.mode,'status',target.status);
end $$;

create function public.zelo_of_worker_scope(p_mode text,p_owner_email text default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog set row_security=off as $$
declare target uuid;
begin
  if p_mode is null or p_mode not in ('personal','business') then raise exception 'OF_SCOPE_INVALID'; end if;
  insert into open_finance.worker_health(mode,last_seen_at) values(p_mode,now()) on conflict(mode) do update set last_seen_at=now();
  select j.user_id into target from open_finance.sync_jobs j
  join open_finance.connections c on c.id=j.connection_id
  join open_finance.user_access a on a.user_id=j.user_id
  join public.users u on u.id=j.user_id
  where j.environment='production' and j.mode=p_mode and a.enabled and a.country_code='BR' and a.country_verified_at is not null
    and u.status='active' and (p_mode='personal' or u.plan='business' or (nullif(btrim(p_owner_email),'') is not null and lower(btrim(u.email))=lower(btrim(p_owner_email))))
    and (a.next_sync_claim_at is null or a.next_sync_claim_at<=now())
    and c.status not in ('revoked','revoking') and (c.status='active' or j.kind='consent')
    and j.available_at<=now() and (j.status='pending' or (j.status='running' and j.lease_until<now()))
    and not exists(select 1 from open_finance.sync_jobs running where running.user_id=j.user_id and running.status='running' and running.lease_until>now())
  order by j.available_at,j.updated_at,j.id limit 1;
  if target is null then return null; end if;
  return jsonb_build_object('userId',target,'mode',p_mode,'environment','production');
end $$;

create or replace function public.zelo_of_capabilities(p_user uuid,p_mode text) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog set row_security=off as $$
begin
  perform open_finance.require_access(p_user,p_mode);
  return jsonb_build_object('version','multi-user-sync-v5','worker_recent',
    coalesce((select last_seen_at>now()-interval '3 minutes' from open_finance.worker_health where mode=p_mode),false)
    or coalesce((select (case when p_mode='personal' then last_worker_personal_at else last_worker_business_at end)>now()-interval '3 minutes' from open_finance.user_access where user_id=p_user),false));
end $$;

revoke all on function public.zelo_of_enable_brazil(uuid,text,text,boolean),public.zelo_of_event_target(text,text),public.zelo_of_worker_scope(text,text) from public,anon,authenticated;
grant execute on function public.zelo_of_enable_brazil(uuid,text,text,boolean),public.zelo_of_event_target(text,text),public.zelo_of_worker_scope(text,text) to service_role;
commit;
