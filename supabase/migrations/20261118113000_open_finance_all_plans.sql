-- All subscriptions include Personal and Business Open Finance.
-- Replace only legacy plan gates; preserve the live ownership, ACLs and RLS settings.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $$begin execute format('grant zelo_of_workspace to %I',current_user);end;$$;
grant create on schema public,open_finance to zelo_of_workspace;
do $migration$
declare rule record; definition text;
begin
 for rule in select * from (values
  ('public.zelo_of_enable_brazil(uuid,text,text,boolean)','and (p_mode=''personal'' or plan=''business'')'),
  ('public.zelo_of_worker_scope(text,text)','and (p_mode=''personal'' or u.plan=''business'' or (nullif(btrim(p_owner_email),'''') is not null and lower(btrim(u.email))=lower(btrim(p_owner_email))))'),
  ('public.zelo_of_notice_targets(text)','and (i.mode=''personal'' or u.plan=''business'' or (nullif(btrim(p_owner_email),'''') is not null and lower(btrim(u.email))=lower(btrim(p_owner_email))))'),
  ('public.zelo_of_notice_claim(uuid,text,text,text,text)','and (p_mode=''personal'' or plan=''business'' or (nullif(btrim(p_owner_email),'''') is not null and lower(btrim(email))=lower(btrim(p_owner_email))))'),
  ('public.zelo_of_prepare_schedules(text)','and (resource.mode=''personal'' or u.plan=''business'' or (nullif(btrim(p_owner_email),'''') is not null and lower(btrim(u.email))=lower(btrim(p_owner_email))))'),
  ('public.zelo_of_credit_pix_targets()','and(q.mode=''personal'' or u.plan=''business'')')
 ) gates(signature,predicate) loop
  definition:=pg_get_functiondef(rule.signature::regprocedure);
  if strpos(definition,rule.predicate)=0 then
   raise exception 'OF_PLAN_GATE_NOT_FOUND: %',rule.signature;
  end if;
  execute replace(definition,rule.predicate,'');
 end loop;
end;
$migration$;
revoke create on schema public,open_finance from zelo_of_workspace;
do $$begin execute format('revoke zelo_of_workspace from %I',current_user);end;$$;
notify pgrst,'reload schema';
commit;
