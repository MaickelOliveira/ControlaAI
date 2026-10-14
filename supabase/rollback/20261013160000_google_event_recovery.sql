-- Close only new job selection; retain all origins, leases, results and history.
begin;
set local lock_timeout='5s';set local statement_timeout='30s';
revoke all on function public.zelo_google_event_pending(integer) from public,anon,authenticated,service_role;
commit;
