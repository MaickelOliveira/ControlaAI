-- Disable OPEN_FINANCE_BATCH_REPORT_ENABLED before applying this rollback.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
create temporary table zelo_ledger_rollback_privileges on commit drop as
 select pg_has_role(current_user,'zelo_of_workspace','SET') and pg_has_role(current_user,'zelo_of_workspace','USAGE') as effective,
 (select jsonb_build_object('admin',admin_option,'inherit',inherit_option,'set',set_option) from pg_auth_members where roleid='zelo_of_workspace'::regrole and member=(select oid from pg_roles where rolname=current_user) and grantor=(select oid from pg_roles where rolname=current_user)) as own_grant,
 has_schema_privilege('zelo_of_workspace','public','CREATE') as public_create,
 has_schema_privilege('zelo_of_workspace','open_finance','CREATE') as private_create;
do $$declare original jsonb;begin
 if not exists(select 1 from pg_roles where rolname='zelo_of_workspace' and not rolcanlogin and not rolsuper and not rolbypassrls) then raise exception 'OF_WORKSPACE_ROLE_UNSAFE';end if;
 if not(select effective from zelo_ledger_rollback_privileges) then
  select own_grant into original from zelo_ledger_rollback_privileges;
  execute format('grant zelo_of_workspace to %I with admin %s,inherit true,set true granted by %I',current_user,case when (original->>'admin')::boolean then 'true' else 'false' end,current_user);
 end if;
end;$$;
create or replace function public.zelo_of_report(p_user uuid,p_mode text,p_from date,p_to date,p_after uuid default null) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog set row_security=on as $$
declare after_date date;result jsonb;
begin
 perform open_finance.require_access(p_user,p_mode);
 if p_from is null or p_to is null or p_from<'1900-01-01' or p_to<p_from or p_to-p_from>365 then raise exception 'OF_PERIOD_INVALID';end if;
 if p_after is not null then
  select transaction_date into after_date from open_finance.movements where id=p_after and user_id=p_user and environment='production' and mode=p_mode and transaction_date between p_from and p_to;
  if not found then raise exception 'OF_CURSOR_INVALID';end if;
 end if;
 with links as (
  select x.*,a.amount=x.gross_amount and b.amount=x.payment_amount and a.currency='BRL' and b.currency='BRL'
   and a.transaction_date=x.credit_date and b.transaction_date=x.payment_date and a.resource_type='card' and a.direction='debit' and a.source_type='OPERACOES_CREDITO_CONTRATADAS_CARTAO'
   and b.resource_type='account' and b.direction='debit' and b.source_type='PIX'
   and a.classification not in ('bill_payment','transfer','investment') and b.classification not in ('bill_payment','transfer','investment') as valid
  from open_finance.credit_pix_links x
  join open_finance.movements a on a.id=x.credit_movement and a.user_id=x.user_id and a.mode=x.mode and a.environment=x.environment and a.company_id is not distinct from x.company_id
  join open_finance.movements b on b.id=x.payment_movement and b.user_id=x.user_id and b.mode=x.mode and b.environment=x.environment and b.company_id is not distinct from x.company_id
  where x.user_id=p_user and x.mode=p_mode and x.environment='production' and x.voided_at is null
 ), scoped as (
  select m.*,r.name as resource_name,c.institution_name,c.institution_id,
   case when m.classification in ('bill_payment','transfer','investment') then 'excluded'
    when m.resource_type='card' and m.direction='debit' and m.classification='purchase' then 'card_purchases'
    when m.resource_type='account' and m.direction='debit' then 'account_debits'
    when m.direction='credit' then 'credits' else 'other' end as kind,
   case when x.valid and m.id=x.credit_movement then x.charges_amount else m.amount end as spending_amount,
   case when x.id is not null then jsonb_build_object('id',x.id,'status',case when x.valid then 'active' else 'review' end,'role',case when m.id=x.credit_movement then 'credit' else 'payment' end,'gross_amount',x.gross_amount::text,'payment_amount',x.payment_amount::text,'charges_amount',x.charges_amount::text) end as credit_reconciliation
  from open_finance.movements m
  join open_finance.resources r on r.id=m.resource_id and r.user_id=m.user_id and r.environment=m.environment and r.mode=m.mode
  join open_finance.connections c on c.id=r.connection_id and c.user_id=r.user_id and c.environment=r.environment and c.mode=r.mode
  left join links x on m.id in (x.credit_movement,x.payment_movement)
  where m.user_id=p_user and m.environment='production' and m.mode=p_mode and m.transaction_date between p_from and p_to
 ), page as (
  select * from scoped where p_after is null or (transaction_date,id)<(after_date,p_after) order by transaction_date desc,id desc limit 51
 ), visible as (select * from page order by transaction_date desc,id desc limit 50), totals as (
  select kind,currency,sum(spending_amount)::text as amount,count(*) as count,count(*) filter(where amount is null) as missing_amounts from scoped group by kind,currency
 ) select jsonb_build_object(
  'from',p_from,'to',p_to,'history_complete',false,
  'totals',coalesce((select jsonb_agg(to_jsonb(t) order by t.kind,t.currency)from totals t),'[]'::jsonb),
  'movements',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'resource_id',v.resource_id,'resource_name',v.resource_name,'institution_name',v.institution_name,'institution_id',v.institution_id,'resource_type',v.resource_type,'date',v.transaction_date,'description',v.description,'amount',v.amount::text,'currency',v.currency,'direction',v.direction,'classification',v.classification,'kind',v.kind,'source_type',v.source_type,'source_category',v.source_category,'user_category',v.user_category,'credit_reconciliation',v.credit_reconciliation,'bill_month',v.bill_month,'installment_number',v.installment_number,'installment_count',v.installment_count) order by v.transaction_date desc,v.id desc)from visible v),'[]'::jsonb),
  'next',case when(select count(*) from page)>50 then(select id from visible order by transaction_date,id limit 1)else null end,
  'missing_dates',(select count(*) from open_finance.movements where user_id=p_user and environment='production' and mode=p_mode and transaction_date is null),
  'sync_pending',exists(select 1 from open_finance.sync_jobs j where j.user_id=p_user and j.environment='production' and j.mode=p_mode and (j.status in ('pending','running') or (j.status='failed' and not exists(select 1 from open_finance.sync_jobs newer where newer.connection_id=j.connection_id and newer.kind=j.kind and newer.family=j.family and newer.external_resource_id=j.external_resource_id and newer.filter_window=j.filter_window and newer.status='complete' and newer.updated_at>j.updated_at)))),
  'last_successful_sync_at',(select max(last_successful_sync_at)from open_finance.connections where user_id=p_user and environment='production' and mode=p_mode)
 ) into result;
 return result;
end;$$;
drop function public.zelo_of_ledger_report(uuid,text,date,date);
drop function open_finance.report_page(uuid,text,date,date,uuid,integer);
do $$declare original jsonb;begin
 if not(select effective from zelo_ledger_rollback_privileges) then
  if (select own_grant from zelo_ledger_rollback_privileges) is null then execute format('revoke zelo_of_workspace from %I granted by %I',current_user,current_user);
  else
   select own_grant into original from zelo_ledger_rollback_privileges;
   execute format('grant zelo_of_workspace to %I with admin %s,inherit %s,set %s granted by %I',current_user,case when (original->>'admin')::boolean then 'true' else 'false' end,case when (original->>'inherit')::boolean then 'true' else 'false' end,case when (original->>'set')::boolean then 'true' else 'false' end,current_user);
  end if;
 end if;
end;$$;
commit;
