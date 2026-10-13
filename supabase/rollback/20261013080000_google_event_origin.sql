-- Disable consumers first; preserve every intent, origin, binding and credential.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
revoke all on google_workspace.event_origins from public,anon,authenticated,service_role;
revoke all on function google_workspace.event_retry_id(uuid,text,uuid,uuid,boolean),google_workspace.event_origin_metadata(google_workspace.event_origins),
 public.zelo_google_event_origin_get(uuid,text,uuid,uuid),public.zelo_google_event_origin_reserve(uuid,text,uuid,uuid,uuid,uuid,bigint,text) from public,anon,authenticated,service_role;
commit;
