-- Stop new explicit confirmations; preserve effective ETags and acknowledged history.
begin;
set local lock_timeout='5s';set local statement_timeout='30s';
revoke all on function public.zelo_google_event_conflict_get(uuid,text,uuid,uuid,uuid,text),public.zelo_google_event_conflict_confirm(uuid,text,uuid,uuid,uuid,text,uuid,text,bigint,text) from public,anon,authenticated,service_role;
revoke insert on google_workspace.event_etag_confirmations from service_role;
commit;
