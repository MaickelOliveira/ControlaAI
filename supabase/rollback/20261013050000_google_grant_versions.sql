-- Disable the dormant accessor without deleting history or credential bytes.
begin;
set local lock_timeout='5s';
revoke all on function public.zelo_google_grant_versions(uuid,text,uuid,text) from public,anon,authenticated,service_role;
commit;
