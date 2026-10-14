-- Close new consumer mutation API; retain history, receipts and prior guards.
begin;
set local lock_timeout='5s';set local statement_timeout='30s';
revoke all on google_workspace.event_user_retries,google_workspace.event_user_commands,google_workspace.event_user_local_mutations from public,anon,authenticated,service_role;
revoke all on function google_workspace.event_user_snapshot(uuid,text,uuid,uuid),
 public.zelo_google_event_command_prepare_expected(uuid,text,uuid,uuid,uuid,text,text,bigint,text,jsonb,jsonb),
 public.zelo_google_event_user_retry_get(uuid,text,uuid,uuid,uuid,text),
 public.zelo_google_event_user_retry(uuid,text,uuid,uuid,uuid,text,text,bigint),
 public.zelo_google_appointment_local_patch(uuid,text,uuid,uuid,uuid,text,jsonb,jsonb) from public,anon,authenticated,service_role;
commit;
