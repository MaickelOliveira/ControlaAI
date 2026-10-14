-- Bind consent initiation to the exact confirmed settings revision.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
create function public.zelo_google_state_issue_expected(
 p_user_id uuid,p_mode text,p_company_id uuid,p_state_hash text,p_session_hash text,
 p_client_fingerprint text,p_nonce_hash text,p_locale text,p_binding_version bigint
) returns void language plpgsql security invoker set search_path=pg_catalog as $$
declare current_version bigint;
begin
 perform google_workspace.lock_workspace(p_user_id,p_mode,p_company_id,true);
 if p_binding_version is null or p_binding_version<0 then raise exception 'GOOGLE_STATE_INVALID';end if;
 select coalesce((select version from google_workspace.bindings where user_id=p_user_id and mode=p_mode
  and company_id is not distinct from p_company_id),0) into current_version;
 if current_version<>p_binding_version then raise exception 'GOOGLE_BINDING_CONFLICT';end if;
 perform public.zelo_google_state_issue(p_user_id,p_mode,p_company_id,p_state_hash,p_session_hash,p_client_fingerprint,p_nonce_hash,p_locale);
end;$$;
revoke all on function public.zelo_google_state_issue_expected(uuid,text,uuid,text,text,text,text,text,bigint) from public,anon,authenticated,service_role;
grant execute on function public.zelo_google_state_issue_expected(uuid,text,uuid,text,text,text,text,text,bigint) to service_role;
commit;
