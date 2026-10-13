-- Disable consumers first; retain immutable payloads, attempts, origins and tokens.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
revoke all on google_workspace.event_creations from public,anon,authenticated,service_role;
revoke update(state,attempt_version,round_attempts,authorized_binding_version,lease_id,lease_until,lease_binding_version,insert_allowed,was_attempted,remote_known,etag,meet_link,failure_code)
 on google_workspace.event_creations from public,anon,authenticated,service_role;
revoke all on function google_workspace.event_creation_context(uuid,text,uuid,uuid,text,bigint),google_workspace.event_creation_metadata(google_workspace.event_creations),
 public.zelo_google_event_creation_get(uuid,text,uuid,uuid),public.zelo_google_event_creation_prepare(uuid,text,uuid,uuid,text,bigint,jsonb,boolean),
 public.zelo_google_event_creation_claim(uuid,text,uuid,uuid,text,bigint,bigint),public.zelo_google_event_creation_finish(uuid,text,uuid,uuid,text,bigint,bigint,uuid,text,boolean,text,text,text),
 public.zelo_google_event_creation_retry(uuid,text,uuid,uuid,text,bigint,bigint) from public,anon,authenticated,service_role;
commit;
