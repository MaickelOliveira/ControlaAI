begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

-- Archive authorization visibility after provider-confirmed cancellation.
-- Imported products, bills and movements remain available as financial history.
create or replace function public.zelo_of_begin_removal(p_user uuid,p_mode text,p_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog set row_security=off as $$
declare c open_finance.connections;
begin
  perform open_finance.require_access(p_user,p_mode);
  select * into c from open_finance.connections where id=p_id and user_id=p_user and environment='production' and mode=p_mode for update;
  if c.id is null then raise exception 'OF_CONNECTION_NOT_FOUND'; end if;
  if c.status not in ('pending','expired','error','revoking','revoked') then raise exception 'OF_CONNECTION_ACTIVE'; end if;
  if c.status<>'revoked' then
    update open_finance.connections set status='revoking',updated_at=now() where id=c.id returning * into c;
  end if;
  return to_jsonb(c);
end $$;

create or replace function public.zelo_of_connection_visibility(p_user uuid,p_mode text,p_id uuid,p_archived boolean) returns void
language plpgsql security definer set search_path=pg_catalog set row_security=off as $$
declare c open_finance.connections;
begin
  perform open_finance.require_access(p_user,p_mode);
  if p_archived is null then raise exception 'OF_VISIBILITY_INVALID'; end if;
  select * into c from open_finance.connections where id=p_id and user_id=p_user and environment='production' and mode=p_mode for update;
  if c.id is null then raise exception 'OF_CONNECTION_NOT_FOUND'; end if;
  if p_archived and c.status<>'revoked' then raise exception 'OF_REMOVAL_NOT_CONFIRMED'; end if;
  update open_finance.connections set archived_at=case when p_archived then coalesce(archived_at,now()) else null end,updated_at=now() where id=c.id;
end $$;

revoke all on function public.zelo_of_begin_removal(uuid,text,uuid),public.zelo_of_connection_visibility(uuid,text,uuid,boolean) from public,anon,authenticated;
grant execute on function public.zelo_of_begin_removal(uuid,text,uuid),public.zelo_of_connection_visibility(uuid,text,uuid,boolean) to service_role;
commit;
