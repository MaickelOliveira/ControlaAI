-- Disable the dormant feature while retaining every original and assigned record.
begin;
set local lock_timeout='5s';
revoke all on google_workspace.legacy_assignments from public,anon,authenticated,service_role;
revoke all on function google_workspace.legacy_fingerprint(public.google_tokens),
 public.zelo_google_legacy_status(uuid,text,uuid),public.zelo_google_legacy_snapshot(uuid,text,uuid),
 public.zelo_google_legacy_assign(uuid,text,uuid,text,text,text,bigint,bigint,text,text,timestamptz,text,text) from public,anon,authenticated,service_role;
commit;
