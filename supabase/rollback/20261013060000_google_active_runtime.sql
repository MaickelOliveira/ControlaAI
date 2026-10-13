-- Disable access without modifying connections, credentials or history.
begin;
set local lock_timeout='5s';
revoke all on function public.zelo_google_runtime_get(uuid,text,uuid,text) from public,anon,authenticated,service_role;
commit;
