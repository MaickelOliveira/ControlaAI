-- Close readonly replay getter; retain original inputs and local history.
begin;
set local lock_timeout='5s';set local statement_timeout='30s';
revoke all on function public.zelo_google_appointment_local_mutation_get(uuid,text,uuid,uuid,uuid,text) from public,anon,authenticated,service_role;
commit;
