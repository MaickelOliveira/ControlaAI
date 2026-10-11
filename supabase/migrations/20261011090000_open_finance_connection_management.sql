begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

-- Visibility metadata only: consent and financial records remain in the private schema.
alter table open_finance.connections add column archived_at timestamptz;
alter table open_finance.connections add constraint connections_archive_check check(archived_at is null or status='revoked');

create function public.zelo_of_begin_removal(p_user uuid,p_mode text,p_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog set row_security=off as $$
declare c open_finance.connections;
begin
  perform open_finance.require_access(p_user,p_mode);
  select * into c from open_finance.connections where id=p_id and user_id=p_user and environment='production' and mode=p_mode for update;
  if c.id is null then raise exception 'OF_CONNECTION_NOT_FOUND'; end if;
  if c.status not in ('pending','expired','error','revoking','revoked') then raise exception 'OF_CONNECTION_ACTIVE'; end if;
  if exists(select 1 from open_finance.resources where connection_id=c.id) then raise exception 'OF_ATTEMPT_HAS_DATA'; end if;
  if c.status<>'revoked' then
    update open_finance.connections set status='revoking',updated_at=now() where id=c.id returning * into c;
  end if;
  return to_jsonb(c);
end $$;

create function public.zelo_of_connection_visibility(p_user uuid,p_mode text,p_id uuid,p_archived boolean) returns void
language plpgsql security definer set search_path=pg_catalog set row_security=off as $$
declare c open_finance.connections;
begin
  perform open_finance.require_access(p_user,p_mode);
  if p_archived is null then raise exception 'OF_VISIBILITY_INVALID'; end if;
  select * into c from open_finance.connections where id=p_id and user_id=p_user and environment='production' and mode=p_mode for update;
  if c.id is null then raise exception 'OF_CONNECTION_NOT_FOUND'; end if;
  if p_archived and (c.status<>'revoked' or exists(select 1 from open_finance.resources where connection_id=c.id)) then raise exception 'OF_REMOVAL_NOT_CONFIRMED'; end if;
  update open_finance.connections set archived_at=case when p_archived then coalesce(archived_at,now()) else null end,updated_at=now() where id=c.id;
end $$;

create or replace function public.zelo_of_overview(p_user uuid,p_environment text,p_mode text) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog set row_security=off as $$
declare result jsonb;
begin
  result:=public.zelo_of_overview_v5(p_user,p_environment,p_mode);
  return result||jsonb_build_object(
    'connections',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'institution_id',c.institution_id,'institution_name',c.institution_name,'status',c.status,'provider_status',c.provider_status,'scopes',c.scopes,'consent_expires_at',c.consent_expires_at,'revoked_at',c.revoked_at,'last_successful_sync_at',c.last_successful_sync_at,'created_at',c.created_at,'sync_notes',c.sync_notes,'archived_at',c.archived_at,'has_imported_data',exists(select 1 from open_finance.resources r where r.connection_id=c.id)) order by (c.archived_at is null) desc,c.created_at desc),'[]') from (select * from open_finance.connections where user_id=p_user and environment=p_environment and mode=p_mode order by (archived_at is null) desc,created_at desc limit 100)c),
    'bills',(select coalesce(jsonb_agg(e||jsonb_build_object('payment_amount',b.payment_amount::text,'payment_evidence',b.payment_evidence,'synced_at',b.synced_at)),'[]') from jsonb_array_elements(result->'bills') e join open_finance.bills b on b.id=(e->>'id')::uuid),
    'agenda',public.zelo_of_agenda(p_user,p_mode,(now() at time zone 'America/Sao_Paulo')::date-365,(now() at time zone 'America/Sao_Paulo')::date+365,true));
end $$;

revoke all on function public.zelo_of_begin_removal(uuid,text,uuid),public.zelo_of_connection_visibility(uuid,text,uuid,boolean) from public,anon,authenticated;
grant execute on function public.zelo_of_begin_removal(uuid,text,uuid),public.zelo_of_connection_visibility(uuid,text,uuid,boolean) to service_role;
commit;
