-- Dormant pre-exchange revision snapshot; no token bytes or browser access.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
create function public.zelo_google_grant_versions(p_user_id uuid,p_mode text,p_company_id uuid,p_client_fingerprint text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare revisions jsonb;
begin
 perform google_workspace.lock_workspace(p_user_id,p_mode,p_company_id,false);
 perform google_workspace.validate_identity('snapshot',p_client_fingerprint);
 select coalesce(jsonb_agg(jsonb_build_object('subject',g.subject,'version',g.version::text) order by g.subject),'[]'::jsonb)
 into revisions from google_workspace.grants g where g.user_id=p_user_id and g.client_fingerprint=p_client_fingerprint;
 if jsonb_array_length(revisions)>10000 then raise exception 'GOOGLE_GRANT_INVALID';end if;
 return revisions;
end;$$;
revoke all on function public.zelo_google_grant_versions(uuid,text,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.zelo_google_grant_versions(uuid,text,uuid,text) to service_role;
commit;
