-- Close receipt APIs; retain original local rows and immutable retry history.
begin;
set local lock_timeout='5s';set local statement_timeout='30s';
revoke all on google_workspace.local_appointment_receipts from public,anon,authenticated,service_role;
revoke all on function public.zelo_google_local_appointment_get(uuid,text,uuid,uuid),public.zelo_google_local_appointment_create(uuid,text,uuid,uuid,jsonb,text) from public,anon,authenticated,service_role;
commit;
