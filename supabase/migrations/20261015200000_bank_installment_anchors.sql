-- Link installment patterns only to their own observed bank transaction.
-- A bill month is a projection anchor, never proof of payment or a due day.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
create temporary table zelo_installment_migration_privileges on commit drop as
 select pg_has_role(current_user,'zelo_of_workspace','SET') and pg_has_role(current_user,'zelo_of_workspace','USAGE') as effective,
 (select jsonb_build_object('admin',admin_option,'inherit',inherit_option,'set',set_option) from pg_auth_members where roleid='zelo_of_workspace'::regrole and member=(select oid from pg_roles where rolname=current_user) and grantor=(select oid from pg_roles where rolname=current_user)) as own_grant,
 has_schema_privilege('zelo_of_workspace','public','CREATE') as public_create;
do $$declare original jsonb;begin
 if not exists(select 1 from pg_roles where rolname='zelo_of_workspace' and not rolcanlogin and not rolsuper and not rolbypassrls) then raise exception 'OF_WORKSPACE_ROLE_UNSAFE';end if;
 if not(select effective from zelo_installment_migration_privileges) then
  select own_grant into original from zelo_installment_migration_privileges;
  execute format('grant zelo_of_workspace to %I with admin %s,inherit true,set true granted by %I',current_user,case when (original->>'admin')::boolean then 'true' else 'false' end,current_user);
 end if;
 if not(select public_create from zelo_installment_migration_privileges) then grant create on schema public to zelo_of_workspace;end if;
end;$$;

create function public.zelo_of_installment_anchors(p_user uuid,p_mode text) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog set row_security=on as $$
declare result jsonb;
begin
  perform open_finance.require_access(p_user,p_mode);
  with candidates as (
    select s.id,s.resource_id,s.description,r.name as resource_name,
      c.institution_name,c.institution_id,s.amount::text as amount,
      m.currency,coalesce(m.bill_month,date_trunc('month',b.due_date)::date) as bill_month,
      m.installment_number as observed_installments,s.total_installments,s.synced_at
    from open_finance.card_schedules s
    join open_finance.resources r on r.id=s.resource_id and r.user_id=s.user_id and r.environment=s.environment and r.mode=s.mode
    join open_finance.connections c on c.id=r.connection_id and c.user_id=s.user_id and c.environment=s.environment and c.mode=s.mode
    join open_finance.sync_jobs j on j.id=s.last_job_id
    join open_finance.movements m on m.resource_id=s.resource_id and m.user_id=s.user_id and m.environment=s.environment and m.mode=s.mode
      and m.external_id=any(s.observed_transactions) and m.installment_number between 1 and s.total_installments
      and m.installment_count=s.total_installments and m.amount=s.amount and m.currency is not null
      and m.direction='debit'
    left join open_finance.bills b on b.id=m.bill_id and b.resource_id=m.resource_id and b.user_id=m.user_id and b.environment=m.environment and b.mode=m.mode
    where s.user_id=p_user and s.environment='production' and s.mode=p_mode and s.kind='installment'
      and c.status='active' and (c.consent_expires_at is null or c.consent_expires_at>now())
      and 'CREDIT_CARD_ACCOUNT'=any(c.scopes) and j.status='complete'
      and not exists(select 1 from open_finance.sync_jobs newer where newer.connection_id=j.connection_id
        and newer.kind=j.kind and newer.external_resource_id=j.external_resource_id
        and newer.status='complete' and newer.updated_at>j.updated_at)
  ), ranked as (
    select *,max(observed_installments) over(partition by id) as latest_installment
    from candidates where bill_month is not null
      and bill_month<=date_trunc('month',now() at time zone 'America/Sao_Paulo')::date
  ), unambiguous as (
    select id,resource_id,description,resource_name,institution_name,institution_id,amount,
      min(currency) as currency,min(bill_month) as bill_month,
      observed_installments,total_installments,synced_at
    from ranked where observed_installments=latest_installment
    group by id,resource_id,description,resource_name,institution_name,institution_id,amount,
      observed_installments,total_installments,synced_at
    having count(*)=1
  ), visible as (
    select * from unambiguous order by id limit 2000
  )
  select jsonb_build_object(
    'items',coalesce((select jsonb_agg(to_jsonb(v) order by v.id) from visible v),'[]'::jsonb),
    'incomplete',(select count(*)>2000 from unambiguous)
  ) into result;
  return result;
end $$;

alter function public.zelo_of_installment_anchors(uuid,text) owner to zelo_of_workspace;
revoke all on function public.zelo_of_installment_anchors(uuid,text) from public,anon,authenticated;
grant execute on function public.zelo_of_installment_anchors(uuid,text) to service_role;

-- Keep the original bank schedule for history, but expose the month and ordinal
-- of a linked bank movement so readers can hide an expired forecast.
create or replace view open_finance.agenda_items as
select b.user_id,b.mode,'bill:'||b.id::text as item_key,b.id,b.resource_id,'bill'::text as kind,'Fatura do cartão'::text as description,r.name as resource_name,c.institution_name,b.due_date,b.total_amount as amount,b.currency,b.synced_at,b.payment_evidence,b.payment_amount,null::integer as total_installments,null::integer as observed_installments,null::numeric as regularity_score,null::date as last_observed_month,null::integer as last_observed_installment
from open_finance.bills b join open_finance.resources r on r.id=b.resource_id join open_finance.connections c on c.id=r.connection_id
where b.environment='production' and 'CREDIT_CARD_ACCOUNT'=any(c.scopes) and c.status='active' and (c.consent_expires_at is null or c.consent_expires_at>now())
union all
select s.user_id,s.mode,s.kind||':'||s.id::text,s.id,s.resource_id,s.kind,s.description,r.name,c.institution_name,s.due_date,s.amount,s.currency,s.synced_at,false,null,s.total_installments,greatest(evidence.installment_number,s.observed_installments),s.regularity_score,evidence.bill_month,evidence.installment_number
from open_finance.card_schedules s join open_finance.resources r on r.id=s.resource_id join open_finance.connections c on c.id=r.connection_id join open_finance.sync_jobs j on j.id=s.last_job_id
left join lateral (
 select m.bill_month,m.installment_number from open_finance.movements m
 where s.kind='installment' and m.resource_id=s.resource_id and m.user_id=s.user_id and m.environment=s.environment and m.mode=s.mode
   and m.external_id=any(s.observed_transactions) and m.installment_number between 1 and s.total_installments
   and m.installment_count=s.total_installments and m.amount=s.amount and m.bill_month is not null and m.direction='debit'
   and m.bill_month<=date_trunc('month',now() at time zone 'America/Sao_Paulo')::date
 order by m.installment_number desc,m.bill_month desc limit 1
) evidence on true
where 'CREDIT_CARD_ACCOUNT'=any(c.scopes) and c.status='active' and (c.consent_expires_at is null or c.consent_expires_at>now()) and j.status='complete'
  and not (s.kind='recurring' and lower(s.description) ~ '(^|[^[:alpha:]])z[eé][[:space:]]*delivery([^[:alpha:]]|$)')
  and not exists(select 1 from open_finance.sync_jobs newer where newer.connection_id=j.connection_id and newer.kind=j.kind and newer.external_resource_id=j.external_resource_id and newer.status='complete' and newer.updated_at>j.updated_at);
alter view open_finance.agenda_items set(security_invoker=true);
revoke all on open_finance.agenda_items from public,anon,authenticated,service_role;
grant select on open_finance.agenda_items to zelo_of_workspace;
do $$declare original jsonb;begin
 if not(select public_create from zelo_installment_migration_privileges) then revoke create on schema public from zelo_of_workspace;end if;
 if not(select effective from zelo_installment_migration_privileges) then
  if (select own_grant from zelo_installment_migration_privileges) is null then execute format('revoke zelo_of_workspace from %I granted by %I',current_user,current_user);
  else
   select own_grant into original from zelo_installment_migration_privileges;
   execute format('grant zelo_of_workspace to %I with admin %s,inherit %s,set %s granted by %I',current_user,case when (original->>'admin')::boolean then 'true' else 'false' end,case when (original->>'inherit')::boolean then 'true' else 'false' end,case when (original->>'set')::boolean then 'true' else 'false' end,current_user);
  end if;
 end if;
end;$$;
commit;
