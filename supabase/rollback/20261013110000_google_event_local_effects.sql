-- Close only this increment, preserving public/private history and prior access.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
revoke all on function google_workspace.event_local_context(uuid,text,uuid,uuid),public.zelo_google_event_local_active(uuid,text,uuid,uuid),
 public.zelo_google_event_local_preflight(uuid,text,uuid,uuid,text,bigint,bigint,uuid),
 public.zelo_google_event_local_finish(uuid,text,uuid,uuid,text,bigint,bigint,uuid,text,boolean,text,text,text) from public,anon,authenticated,service_role;
commit;
