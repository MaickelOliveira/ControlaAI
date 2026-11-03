-- Future card bill installments are bank facts even before the first bill month.
-- Additive read payload only: no expense/payment rows or bank source facts change.
-- Roll back using supabase/rollback/20261103103000_scheduled_bank_installments.sql
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
create temporary table zelo_progress_migration_privileges on commit drop as
 select pg_has_role(current_user,'zelo_of_workspace','SET') and pg_has_role(current_user,'zelo_of_workspace','USAGE') as effective,
 (select jsonb_build_object('admin',admin_option,'inherit',inherit_option,'set',set_option) from pg_auth_members where roleid='zelo_of_workspace'::regrole and member=(select oid from pg_roles where rolname=current_user) and grantor=(select oid from pg_roles where rolname=current_user)) as own_grant,
 has_schema_privilege('zelo_of_workspace','public','CREATE') as public_create;
do $$declare original jsonb;begin
 if not exists(select 1 from pg_roles where rolname='zelo_of_workspace' and not rolcanlogin and not rolsuper and not rolbypassrls) then raise exception 'OF_WORKSPACE_ROLE_UNSAFE';end if;
 if not(select effective from zelo_progress_migration_privileges) then
  select own_grant into original from zelo_progress_migration_privileges;
  execute format('grant zelo_of_workspace to %I with admin %s,inherit true,set true granted by %I',current_user,case when (original->>'admin')::boolean then 'true' else 'false' end,current_user);
 end if;
end;$$;
do $$begin
 if not(select public_create from zelo_progress_migration_privileges) then grant create on schema public to zelo_of_workspace;end if;
end;$$;
DO $migration$
declare definition text;addition text:=$scheduled$
  -- BEGIN scheduled bank installments
  with upcoming as (
    select m.*,r.name as resource_name,c.institution_name,c.institution_id,
      coalesce(m.bill_month,date_trunc('month',b.due_date)::date) as scheduled_month,
      coalesce(m.currency,b.currency,r.currency) as scheduled_currency,
      coalesce((select array_agg(s.id order by s.id) from open_finance.card_schedules s
        join open_finance.sync_jobs j on j.id=s.last_job_id
        where s.user_id=p_user and s.mode=p_mode and s.environment='production'
          and s.resource_id=m.resource_id and s.kind='installment'
          and m.external_id=any(s.observed_transactions) and s.total_installments=m.installment_count
          and j.status='complete' and not exists(select 1 from open_finance.sync_jobs newer
            where newer.connection_id=j.connection_id and newer.kind=j.kind
              and newer.external_resource_id=j.external_resource_id and newer.status='complete' and newer.updated_at>j.updated_at)),array[]::uuid[]) as schedule_ids
    from open_finance.movements m
    join open_finance.resources r on r.id=m.resource_id and r.user_id=m.user_id and r.mode=m.mode and r.environment=m.environment
    join open_finance.connections c on c.id=r.connection_id and c.user_id=m.user_id and c.mode=m.mode and c.environment=m.environment
    left join open_finance.bills b on b.id=m.bill_id and b.resource_id=m.resource_id and b.user_id=m.user_id and b.mode=m.mode and b.environment=m.environment
    where m.user_id=p_user and m.mode=p_mode and m.environment='production' and m.resource_type='card'
      and m.direction='debit' and m.amount>0 and m.transaction_date is not null
      and m.installment_count between 2 and 1000 and m.installment_number between 1 and m.installment_count
      and m.classification not in ('bill_payment','transfer','investment','refund','income')
      and coalesce(m.bill_month,date_trunc('month',b.due_date)::date)>=date_trunc('month',now() at time zone 'America/Sao_Paulo')::date
      and coalesce(m.currency,b.currency,r.currency) is not null
      and c.status='active' and c.archived_at is null and (c.consent_expires_at is null or c.consent_expires_at>now())
      and 'CREDIT_CARD_ACCOUNT'=any(c.scopes)
  ), visible_upcoming as (select * from upcoming order by scheduled_month,id limit 4000)
  select result||jsonb_build_object(
    'scheduled',coalesce((select jsonb_agg(jsonb_build_object(
      'id',m.id,'resource_id',m.resource_id,'resource_name',m.resource_name,'institution_name',m.institution_name,'institution_id',m.institution_id,
      'resource_type','card','date',m.transaction_date,'description',m.description,'amount',m.amount::text,'currency',m.scheduled_currency,
      'direction',m.direction,'classification',m.classification,'kind','card_purchases','source_type',m.source_type,'source_category',m.source_category,
      'user_category',open_finance.schedule_movement_category(m.user_id,m.mode,m.resource_id,m.external_id,m.user_category),
      'bill_month',m.scheduled_month,'installment_number',m.installment_number,'installment_count',m.installment_count,
      'schedule_ids',m.schedule_ids,'synced_at',m.synced_at) order by m.scheduled_month,m.id) from visible_upcoming m),'[]'::jsonb),
    'incomplete',coalesce((result->>'incomplete')::boolean,false) or (select count(*)>4000 from upcoming)
  ) into result;
  -- END scheduled bank installments
$scheduled$;
begin
 definition:=pg_get_functiondef('public.zelo_of_installment_anchors(uuid,text)'::regprocedure);
 if position('-- BEGIN scheduled bank installments' in definition)>0 then raise exception 'OF_SCHEDULED_ALREADY_APPLIED';end if;
 if position('return result;' in definition)=0 or position('row_security' in definition)=0 then raise exception 'OF_SCHEDULED_BASE_MISMATCH';end if;
 execute replace(definition,'return result;',addition||'  return result;');
end $migration$;
do $$declare original jsonb;begin
 if not(select public_create from zelo_progress_migration_privileges) then revoke create on schema public from zelo_of_workspace;end if;
 if not(select effective from zelo_progress_migration_privileges) then
  if (select own_grant from zelo_progress_migration_privileges) is null then execute format('revoke zelo_of_workspace from %I granted by %I',current_user,current_user);
  else
   select own_grant into original from zelo_progress_migration_privileges;
   execute format('grant zelo_of_workspace to %I with admin %s,inherit %s,set %s granted by %I',current_user,case when (original->>'admin')::boolean then 'true' else 'false' end,case when (original->>'inherit')::boolean then 'true' else 'false' end,case when (original->>'set')::boolean then 'true' else 'false' end,current_user);
  end if;
 end if;
end;$$;
notify pgrst,'reload schema';
commit;
