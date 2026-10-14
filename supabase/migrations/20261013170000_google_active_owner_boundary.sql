-- Recheck the existing hasAccess rule at every Google workspace boundary.
-- No activation requirement here: active owners must still start first consent.
begin;
set local lock_timeout='5s';set local statement_timeout='30s';
create or replace function google_workspace.lock_workspace(p_user uuid,p_mode text,p_company uuid,p_write boolean)
returns void language plpgsql security invoker set search_path=pg_catalog as $$
begin
 if p_user is null or p_mode is null or p_mode not in ('personal','business')
  or not((p_mode='personal' and p_company is null) or(p_mode='business' and p_company is not null)) or p_write is null then raise exception 'GOOGLE_WORKSPACE_INVALID';end if;
 if p_write then perform 1 from public.users where id=p_user and status='active' for update;
 else perform 1 from public.users where id=p_user and status='active' for share;end if;
 if not found then raise exception 'GOOGLE_WORKSPACE_ACCESS_DENIED';end if;
 if p_mode='business' then
  perform 1 from public.companies where id=p_company and user_id=p_user and archived_at is null for share;
  if not found then raise exception 'GOOGLE_WORKSPACE_ACCESS_DENIED';end if;
 end if;
end;$$;
create or replace function public.zelo_google_owner_activated(p_user_id uuid)
returns boolean language plpgsql security invoker set search_path=pg_catalog as $$
begin
 -- This is an account-level owner lock, never a default workspace selection.
 perform google_workspace.lock_workspace(p_user_id,'personal',null,false);
 return exists(select 1 from google_workspace.owner_activations where user_id=p_user_id);
end;$$;
revoke all on function google_workspace.lock_workspace(uuid,text,uuid,boolean),public.zelo_google_owner_activated(uuid) from public,anon,authenticated,service_role;
grant execute on function google_workspace.lock_workspace(uuid,text,uuid,boolean),public.zelo_google_owner_activated(uuid) to service_role;
commit;
