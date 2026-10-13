-- Dormant active-binding credential lookup. No live consumer or legacy fallback.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
create function public.zelo_google_runtime_get(p_user_id uuid,p_mode text,p_company_id uuid,p_client_fingerprint text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare b google_workspace.bindings%rowtype;g google_workspace.grants%rowtype;
begin
 perform google_workspace.lock_workspace(p_user_id,p_mode,p_company_id,false);
 perform google_workspace.validate_identity('runtime',p_client_fingerprint);
 select * into b from google_workspace.bindings where user_id=p_user_id and mode=p_mode
  and company_id is not distinct from p_company_id and unlinked_at is null;
 if not found then return null;end if;
 select * into g from google_workspace.grants where id=b.grant_id and user_id=p_user_id and client_fingerprint=p_client_fingerprint;
 if not found then return null;end if;
 return jsonb_build_object('binding',google_workspace.binding_metadata(b)||jsonb_build_object('version',b.version::text),
  'grant',jsonb_build_object('id',g.id,'user_id',g.user_id,'client_fingerprint',g.client_fingerprint,
   'access_ciphertext',g.access_ciphertext,'refresh_ciphertext',g.refresh_ciphertext,'expires_at',g.expires_at,'version',g.version::text));
end;$$;
revoke all on function public.zelo_google_runtime_get(uuid,text,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.zelo_google_runtime_get(uuid,text,uuid,text) to service_role;
commit;
