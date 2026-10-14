-- Retain command inputs/results, links and prior access; close this increment.
begin;
set local lock_timeout='5s';set local statement_timeout='30s';
revoke all on google_workspace.event_command_heads,google_workspace.event_commands from public,anon,authenticated,service_role;
revoke all on function google_workspace.event_command_metadata(google_workspace.event_commands),google_workspace.event_command_local_context(uuid,text,uuid,uuid,boolean),
 google_workspace.event_command_context(uuid,text,uuid,uuid,uuid,text,bigint),public.zelo_google_event_command_head(uuid,text,uuid,uuid),public.zelo_google_event_command_active(uuid,text,uuid,uuid,uuid),
 public.zelo_google_event_command_get(uuid,text,uuid,uuid,uuid),public.zelo_google_event_command_prepare(uuid,text,uuid,uuid,uuid,bigint,text,bigint,text,jsonb,jsonb),
 public.zelo_google_event_command_claim(uuid,text,uuid,uuid,uuid,text,bigint,bigint),public.zelo_google_event_command_preflight(uuid,text,uuid,uuid,uuid,text,bigint,bigint,uuid),
 public.zelo_google_event_command_finish(uuid,text,uuid,uuid,uuid,text,bigint,bigint,uuid,text,text,text,text),public.zelo_google_event_command_retry(uuid,text,uuid,uuid,uuid,text,bigint,bigint)
 from public,anon,authenticated,service_role;
-- Column ACLs survive a table-level revoke.
revoke update(version,operation_id,etag,deleted) on google_workspace.event_command_heads from public,anon,authenticated,service_role;
revoke update(state,attempt_version,round_attempts,authorized_binding_version,lease_id,lease_until,lease_binding_version,mutation_allowed,was_attempted,etag,meet_link,failure_code)
 on google_workspace.event_commands from public,anon,authenticated,service_role;
commit;
