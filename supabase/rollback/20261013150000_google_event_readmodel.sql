-- Close only new reads; retain every public/private row and prior functions.
begin;
set local lock_timeout='5s';set local statement_timeout='30s';
revoke all on function google_workspace.event_read_sync(google_workspace.event_creations,google_workspace.event_command_heads,google_workspace.event_commands,text,boolean,boolean),public.zelo_google_appointment_rows(uuid,text,uuid,uuid,integer),public.zelo_google_meet_rows(uuid,text,uuid,uuid,integer) from public,anon,authenticated,service_role;
commit;
