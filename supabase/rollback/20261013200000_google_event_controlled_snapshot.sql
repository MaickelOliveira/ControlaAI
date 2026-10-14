-- Close readonly controlled helper; retain every local/journal/receipt byte.
begin;
set local lock_timeout='5s';set local statement_timeout='30s';
revoke all on function public.zelo_google_event_controlled_snapshot(uuid,text,uuid,uuid,text) from public,anon,authenticated,service_role;
commit;
