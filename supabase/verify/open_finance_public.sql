-- Read-only deployment proof. No customer identifiers or financial rows.
select
  to_regprocedure('public.zelo_of_enable_brazil(uuid,text,text,boolean)') is not null as enrollment_rpc,
  to_regprocedure('public.zelo_of_event_target(text,text)') is not null as webhook_rpc,
  to_regprocedure('public.zelo_of_worker_scope(text,text)') is not null as worker_rpc,
  exists(select 1 from information_schema.columns where table_schema='open_finance' and table_name='user_access' and column_name='country_confirmation_source') as eligibility_evidence,
  (select relrowsecurity and relforcerowsecurity from pg_class where oid='open_finance.worker_health'::regclass) as private_health,
  not has_schema_privilege('anon','open_finance','usage') and not has_schema_privilege('authenticated','open_finance','usage') as private_schema,
  (select bool_and(not has_function_privilege(r,p.oid,'execute')) from pg_proc p cross join (values('anon'),('authenticated')) roles(r) where p.oid in
    ('public.zelo_of_enable_brazil(uuid,text,text,boolean)'::regprocedure,'public.zelo_of_event_target(text,text)'::regprocedure,'public.zelo_of_worker_scope(text,text)'::regprocedure)) as browser_rpc_denied;
select mode,last_seen_at>now()-interval '3 minutes' as worker_recent from open_finance.worker_health order by mode;
