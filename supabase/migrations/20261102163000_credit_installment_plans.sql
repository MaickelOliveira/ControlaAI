-- Historical repayments and per-contract manual monthly forecasts. No financial entries are posted.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
create temporary table zelo_credit_migration_privileges on commit drop as
 select pg_has_role(current_user,'zelo_of_workspace','SET') and pg_has_role(current_user,'zelo_of_workspace','USAGE') as effective,
 (select jsonb_build_object('admin',admin_option,'inherit',inherit_option,'set',set_option) from pg_auth_members where roleid='zelo_of_workspace'::regrole and member=(select oid from pg_roles where rolname=current_user) and grantor=(select oid from pg_roles where rolname=current_user)) as own_grant,
 has_schema_privilege('zelo_of_workspace','public','CREATE') as public_create,
 has_schema_privilege('zelo_of_workspace','open_finance','CREATE') as private_create;
do $$declare original jsonb;begin
 if not exists(select 1 from pg_roles where rolname='zelo_of_workspace' and not rolcanlogin and not rolsuper and not rolbypassrls) then raise exception 'OF_WORKSPACE_ROLE_UNSAFE';end if;
 if not(select effective from zelo_credit_migration_privileges) then
  select own_grant into original from zelo_credit_migration_privileges;
  execute format('grant zelo_of_workspace to %I with admin %s,inherit true,set true granted by %I',current_user,case when (original->>'admin')::boolean then 'true' else 'false' end,current_user);
 end if;
end;$$;
do $$begin
 if not(select public_create from zelo_credit_migration_privileges) then grant create on schema public to zelo_of_workspace;end if;
 if not(select private_create from zelo_credit_migration_privileges) then grant create on schema open_finance to zelo_of_workspace;end if;
end;$$;
-- Nullable columns keep legacy workers compatible with jsonb_populate_record.
alter table open_finance.credit_details add column payment_history jsonb,add column manual_installment_plan jsonb;
create function open_finance.valid_credit_payments(items jsonb) returns boolean
language plpgsql immutable set search_path=pg_catalog as $$
declare item jsonb;seen text[]:='{}';
begin
 if items is null then return true;end if;
 if jsonb_typeof(items)<>'array' or jsonb_array_length(items)>5000 then return false;end if;
 for item in select value from jsonb_array_elements(items) loop
  if jsonb_typeof(item)<>'object' or (item - array['external_id','date','amount','currency'])<>'{}'::jsonb
   or exists(select 1 from jsonb_each(item) e where jsonb_typeof(e.value)<>'string')
   or not(item ?& array['external_id','date','amount','currency']) or jsonb_typeof(item->'external_id')<>'string'
   or length(item->>'external_id') not between 1 and 200 or item->>'external_id'=any(seen)
   or item->>'date' !~ '^\d{4}-\d{2}-\d{2}$' or (item->>'date')::date<'1900-01-01'
   or item->>'currency' !~ '^[A-Z]{3}$' or item->>'amount' !~ '^\d{1,16}(\.\d{1,8})?$' or (item->>'amount')::numeric<=0 then return false;end if;
  seen:=array_append(seen,item->>'external_id');
 end loop;
 return true;
exception when others then return false;
end;$$;
revoke all on function open_finance.valid_credit_payments(jsonb) from public,anon,authenticated,service_role;
grant execute on function open_finance.valid_credit_payments(jsonb) to zelo_of_workspace;
alter table open_finance.credit_details add constraint credit_payment_history_valid check(open_finance.valid_credit_payments(payment_history));
create function open_finance.merge_credit_payments(previous jsonb,incoming jsonb) returns jsonb
language plpgsql immutable set search_path=pg_catalog as $$
declare merged jsonb;
begin
 if not open_finance.valid_credit_payments(previous) or not open_finance.valid_credit_payments(incoming) then raise exception 'OF_CREDIT_PAYMENTS_INVALID';end if;
 select jsonb_agg(item order by item->>'date',item->>'external_id') into merged from (
  select distinct on(item->>'external_id') item from jsonb_array_elements(coalesce(previous,'[]')||coalesce(incoming,'[]')) with ordinality as p(item,n) order by item->>'external_id',n desc
 ) p;
 if not open_finance.valid_credit_payments(merged) then raise exception 'OF_CREDIT_PAYMENTS_LIMIT';end if;
 return merged;
end;$$;
revoke all on function open_finance.merge_credit_payments(jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function open_finance.merge_credit_payments(jsonb,jsonb) to zelo_of_workspace;
-- Extend the existing leased, owner/workspace checked commit without changing its gates.
do $$declare definition text;old_pick text:='array[''resource_type'',''currency'',''contract_amount'',''outstanding_amount'',''next_installment_amount'',''paid_installments'',''remaining_installments'',''due_date'',''source_updated_at'']';
 old_update text:='next_installment_amount=excluded.next_installment_amount,paid_installments=excluded.paid_installments';
begin
 select pg_get_functiondef('public.zelo_of_commit_page(uuid,text,uuid,uuid,jsonb,text,jsonb)'::regprocedure) into definition;
 if position(old_pick in definition)=0 or position(old_update in definition)=0 then raise exception 'OF_COMMIT_DEFINITION_CHANGED';end if;
 definition:=replace(definition,old_pick,replace(old_pick,'''source_updated_at''','''source_updated_at'',''payment_history'''));
 definition:=replace(definition,old_update,'next_installment_amount=excluded.next_installment_amount,payment_history=open_finance.merge_credit_payments(credit_details.payment_history,excluded.payment_history),paid_installments=excluded.paid_installments');
 execute definition;
end;$$;

create function public.zelo_of_credit_data(p_user uuid,p_mode text,p_from date,p_to date) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog set row_security=on as $$
declare result jsonb;
begin
 perform open_finance.require_access(p_user,p_mode);
 if p_from is null or p_to is null or p_from<'1900-01-01' or p_to<p_from or p_to-p_from>365 then raise exception 'OF_PERIOD_INVALID';end if;
 with scoped as (
  select d.*,r.name,r.connection_id,c.institution_name,c.institution_id
  from open_finance.credit_details d join open_finance.resources r on r.id=d.resource_id and r.user_id=d.user_id and r.mode=d.mode and r.environment=d.environment
  join open_finance.connections c on c.id=r.connection_id and c.user_id=r.user_id and c.mode=r.mode and c.environment=r.environment
  where d.user_id=p_user and d.mode=p_mode and d.environment='production'
 ), payments as (
  select d.*,p.value as payment from scoped d cross join lateral jsonb_array_elements(coalesce(d.payment_history,'[]')) p
  where (p.value->>'date')::date between p_from and p_to
 ), limited as(select * from payments order by payment->>'date',resource_id,payment->>'external_id' limit 2001)
 select jsonb_build_object(
  'payments',coalesce((select jsonb_agg(jsonb_build_object(
   'id','credit:'||resource_id::text||':'||md5(payment->>'external_id'),'resource_id',resource_id,'resource_name',name,'institution_name',institution_name,'institution_id',institution_id,
   'resource_type',resource_type,'date',payment->>'date','description',name,'amount',payment->>'amount','currency',payment->>'currency','direction','debit','classification','loan_repayment','kind','account_debits','source_type','LOAN_REPAYMENT','bill_month',null,'installment_number',null,'installment_count',null)) from limited),'[]'::jsonb),
  'plans',coalesce((select jsonb_agg(manual_installment_plan||jsonb_build_object('resource_id',resource_id)) from scoped where manual_installment_plan is not null),'[]'::jsonb)
 ) into result;
 if jsonb_array_length(result->'payments')>2000 then raise exception 'OF_CREDIT_HISTORY_LIMIT';end if;
 return result;
end;$$;
alter function public.zelo_of_credit_data(uuid,text,date,date) owner to zelo_of_workspace;
revoke all on function public.zelo_of_credit_data(uuid,text,date,date) from public,anon,authenticated;
grant execute on function public.zelo_of_credit_data(uuid,text,date,date) to service_role;

create function public.zelo_of_set_credit_plan(p_user uuid,p_mode text,p_resource uuid,p_plan jsonb) returns boolean
language plpgsql security definer set search_path=pg_catalog set row_security=on as $$
declare d open_finance.credit_details;first_date date;last_date date;months integer;
begin
 perform open_finance.require_access(p_user,p_mode);
 select * into d from open_finance.credit_details where resource_id=p_resource and user_id=p_user and mode=p_mode and environment='production' for update;
 if not found then return false;end if;
 if jsonb_typeof(p_plan) is distinct from 'object' then raise exception 'OF_CREDIT_PLAN_INVALID';end if;
 if exists(select 1 from jsonb_each(p_plan) e where jsonb_typeof(e.value)<>'string') or not(p_plan ?& array['amount','currency','first_due_date','last_due_date']) or (p_plan-array['amount','currency','first_due_date','last_due_date'])<>'{}'::jsonb
  or (p_plan->>'amount') !~ '^\d{1,10}(\.\d{1,2})?$' or (p_plan->>'amount')::numeric<=0 or (p_plan->>'currency') !~ '^[A-Z]{3}$'
  or d.currency is not null and d.currency is distinct from p_plan->>'currency'
  or p_plan->>'first_due_date' !~ '^\d{4}-\d{2}-\d{2}$' or p_plan->>'last_due_date' !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'OF_CREDIT_PLAN_INVALID';end if;
 first_date:=(p_plan->>'first_due_date')::date;last_date:=(p_plan->>'last_due_date')::date;
 months:=(extract(year from last_date)::integer-extract(year from first_date)::integer)*12+extract(month from last_date)::integer-extract(month from first_date)::integer;
 if first_date<'1900-01-01' or last_date<first_date or months>=600 then raise exception 'OF_CREDIT_PLAN_INVALID';end if;
 update open_finance.credit_details set manual_installment_plan=p_plan where resource_id=d.resource_id and user_id=p_user and mode=p_mode;
 return true;
end;$$;
alter function public.zelo_of_set_credit_plan(uuid,text,uuid,jsonb) owner to zelo_of_workspace;
revoke all on function public.zelo_of_set_credit_plan(uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.zelo_of_set_credit_plan(uuid,text,uuid,jsonb) to service_role;

do $$declare original jsonb;begin
 if not(select public_create from zelo_credit_migration_privileges) then revoke create on schema public from zelo_of_workspace;end if;
 if not(select private_create from zelo_credit_migration_privileges) then revoke create on schema open_finance from zelo_of_workspace;end if;
 if not(select effective from zelo_credit_migration_privileges) then
  if (select own_grant from zelo_credit_migration_privileges) is null then execute format('revoke zelo_of_workspace from %I granted by %I',current_user,current_user);
  else
   select own_grant into original from zelo_credit_migration_privileges;
   execute format('grant zelo_of_workspace to %I with admin %s,inherit %s,set %s granted by %I',current_user,case when (original->>'admin')::boolean then 'true' else 'false' end,case when (original->>'inherit')::boolean then 'true' else 'false' end,case when (original->>'set')::boolean then 'true' else 'false' end,current_user);
  end if;
 end if;
end;$$;
commit;
