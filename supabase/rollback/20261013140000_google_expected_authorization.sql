-- Preserve all states, bindings and credentials; close only this new issuer.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
revoke all on function public.zelo_google_state_issue_expected(uuid,text,uuid,text,text,text,text,text,bigint) from public,anon,authenticated,service_role;
commit;
