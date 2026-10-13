-- Disable all new consumers before rollback. Preserve credentials, binding
-- tombstones, calendars and IDs so history and later recovery remain possible.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
revoke all on google_workspace.grants,google_workspace.bindings from public,anon,authenticated,service_role;
revoke all on function public.zelo_google_binding_get(uuid,text,uuid),
 public.zelo_google_grant_for_identity(uuid,text,uuid,text,text),
 public.zelo_google_binding_save(uuid,text,uuid,text,text,text,text,timestamptz,bigint,bigint),
 public.zelo_google_binding_select_calendar(uuid,text,uuid,bigint,text,text),
 public.zelo_google_binding_unlink(uuid,text,uuid,bigint),
 public.zelo_google_grant_refresh(uuid,text,uuid,uuid,text,bigint,text,text,timestamptz),
 google_workspace.lock_workspace(uuid,text,uuid,boolean),
 google_workspace.binding_metadata(google_workspace.bindings),
 google_workspace.validate_identity(text,text),google_workspace.validate_tokens(text,text,timestamptz)
 from public,anon,authenticated,service_role;
-- Do not drop shared schema, roles, legacy rows, OAuth states or references.
commit;
