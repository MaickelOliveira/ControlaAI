-- Close this dormant increment; keep linked records, provenance and credentials.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
revoke all on google_workspace.event_links from public,anon,authenticated,service_role;
revoke all on function public.zelo_google_event_local_get(uuid,text,uuid,uuid),
 public.zelo_google_event_local_create(uuid,text,uuid,uuid,uuid,uuid,bigint,text,jsonb,text,text,jsonb) from public,anon,authenticated,service_role;
commit;
