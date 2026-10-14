-- Original local intention for partial-patch replay, no latest-row rebasing.
begin;
set local lock_timeout='5s';set local statement_timeout='30s';
create function public.zelo_google_appointment_local_mutation_get(p_user_id uuid,p_mode text,p_company_id uuid,p_event_id uuid,p_mutation_id uuid,p_expected_sync_version text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare receipt google_workspace.event_user_local_mutations%rowtype;
begin
 perform google_workspace.event_user_snapshot(p_user_id,p_mode,p_company_id,p_event_id);
 if p_mutation_id is null or(p_expected_sync_version is not null and p_expected_sync_version !~ '^v1:(0|[1-9][0-9]*):(0|[1-9][0-9]*):(0|[1-9][0-9]*)$') then raise exception 'GOOGLE_EVENT_INVALID';end if;
 select * into receipt from google_workspace.event_user_local_mutations where mutation_id=p_mutation_id;
 if not found then return null;end if;
 if receipt.event_id<>p_event_id or receipt.user_id<>p_user_id or receipt.mode<>p_mode or receipt.company_id is distinct from p_company_id
  or receipt.expected_sync_version is distinct from p_expected_sync_version then raise exception 'GOOGLE_EVENT_COMMAND_CONFLICT';end if;
 return jsonb_build_object('payload',receipt.payload,'metadata',receipt.metadata);
end;$$;
revoke all on function public.zelo_google_appointment_local_mutation_get(uuid,text,uuid,uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.zelo_google_appointment_local_mutation_get(uuid,text,uuid,uuid,uuid,text) to service_role;
commit;
