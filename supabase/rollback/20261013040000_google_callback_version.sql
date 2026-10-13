-- Disable consumers first. Preserve live/expired states and all token/history bytes.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
revoke all on function public.zelo_google_state_issue(uuid,text,uuid,text,text,text,text,text),
 public.zelo_google_state_consume(uuid,text,text,text) from public,anon,authenticated,service_role;
-- Do not restore a consumer that ignores captured revisions or drop stored state.
commit;
