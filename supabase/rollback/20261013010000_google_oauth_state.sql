-- Disable the new OAuth consumer first; wait ten minutes before rollback.
-- Never discard an authorization still usable by its original browser.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
lock table google_workspace.oauth_states in access exclusive mode;
do $$begin
 if exists(select 1 from google_workspace.oauth_states where expires_at>clock_timestamp()) then raise exception 'GOOGLE_STATE_ROLLBACK_PENDING';end if;
end;$$;
drop function public.zelo_google_state_consume(uuid,text,text,text);
drop function public.zelo_google_state_issue(uuid,text,uuid,text,text,text,text,text);
drop table google_workspace.oauth_states;
-- Leave the schema and its grants intact for subsequent Google modules.
-- Legacy google_tokens and other workspaces are not touched.
commit;
