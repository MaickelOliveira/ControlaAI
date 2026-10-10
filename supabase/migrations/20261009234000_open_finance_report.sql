-- Read-only DTOs. Money crosses JSON as decimal text; source identifiers stay private.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
create or replace function public.zelo_of_overview(p_user uuid,p_environment text,p_mode text) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog set row_security=off as $$
begin
  if p_environment is distinct from 'production' then raise exception 'OF_SCOPE_INVALID';end if;
  perform open_finance.require_access(p_user,p_mode);
  return jsonb_build_object(
    'connections',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'institution_name',c.institution_name,'status',c.status,'provider_status',c.provider_status,'scopes',c.scopes,'consent_expires_at',c.consent_expires_at,'revoked_at',c.revoked_at,'last_successful_sync_at',c.last_successful_sync_at,'created_at',c.created_at,'sync_notes',c.sync_notes) order by c.created_at desc) from (select * from open_finance.connections where user_id=p_user and environment=p_environment and mode=p_mode order by created_at desc limit 100)c),'[]'::jsonb),
    'resources',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'connection_id',r.connection_id,'resource_type',r.resource_type,'name',r.name,'subtype',r.subtype,'card_network',r.card_network,'identification_last4',r.identification_last4,'currency',r.currency,'available_amount',r.available_amount::text,'gross_amount',r.gross_amount::text,'net_amount',r.net_amount::text,'valuation_date',r.valuation_date,'source_updated_at',r.source_updated_at,'synced_at',r.synced_at) order by r.name,r.id) from (select * from open_finance.resources where user_id=p_user and environment=p_environment and mode=p_mode order by name,id limit 2000)r),'[]'::jsonb),
    'limits',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'resource_id',l.resource_id,'line_name',l.line_name,'consolidation_type',l.consolidation_type,'currency',l.currency,'total_amount',l.total_amount::text,'used_amount',l.used_amount::text,'available_amount',l.available_amount::text,'is_flexible',l.is_flexible)) from (select * from open_finance.card_limits where user_id=p_user and environment=p_environment and mode=p_mode order by id limit 10000)l),'[]'::jsonb),
    'bills',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'resource_id',b.resource_id,'currency',b.currency,'due_date',b.due_date,'total_amount',b.total_amount::text,'minimum_payment_amount',b.minimum_payment_amount::text,'status',b.status) order by b.due_date desc,b.id) from (select * from open_finance.bills where user_id=p_user and environment=p_environment and mode=p_mode order by due_date desc,id limit 1000)b),'[]'::jsonb),
    'credit',coalesce((select jsonb_agg(jsonb_build_object('resource_id',d.resource_id,'currency',d.currency,'contract_amount',d.contract_amount::text,'outstanding_amount',d.outstanding_amount::text,'next_installment_amount',d.next_installment_amount::text,'due_date',d.due_date)) from (select * from open_finance.credit_details where user_id=p_user and environment=p_environment and mode=p_mode order by resource_id limit 2000)d),'[]'::jsonb),
    'sync',coalesce((select jsonb_agg(jsonb_build_object('status',s.status,'last_successful_sync_at',s.last_successful_sync_at,'covered_from',s.covered_from,'covered_to',s.covered_to)) from (select * from open_finance.sync_state where user_id=p_user and environment=p_environment and mode=p_mode order by updated_at desc limit 5000)s),'[]'::jsonb),
    'truncated', (select count(*)>100 from open_finance.connections where user_id=p_user and environment=p_environment and mode=p_mode)
      or (select count(*)>2000 from open_finance.resources where user_id=p_user and environment=p_environment and mode=p_mode)
      or (select count(*)>10000 from open_finance.card_limits where user_id=p_user and environment=p_environment and mode=p_mode)
      or (select count(*)>1000 from open_finance.bills where user_id=p_user and environment=p_environment and mode=p_mode)
      or (select count(*)>2000 from open_finance.credit_details where user_id=p_user and environment=p_environment and mode=p_mode)
      or (select count(*)>5000 from open_finance.sync_state where user_id=p_user and environment=p_environment and mode=p_mode)
  );
end;$$;

create function public.zelo_of_report(p_user uuid,p_mode text,p_from date,p_to date,p_after uuid default null) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog set row_security=off as $$
declare after_date date;result jsonb;
begin
  perform open_finance.require_access(p_user,p_mode);
  if p_from is null or p_to is null or p_from<'1900-01-01' or p_to<p_from or p_to-p_from>365 then raise exception 'OF_PERIOD_INVALID';end if;
  if p_after is not null then
    select transaction_date into after_date from open_finance.movements where id=p_after and user_id=p_user and environment='production' and mode=p_mode and transaction_date between p_from and p_to;
    if not found then raise exception 'OF_CURSOR_INVALID';end if;
  end if;
  with scoped as (
    select m.*,r.name as resource_name,c.institution_name,
      case when m.classification in ('bill_payment','transfer','investment') then 'excluded'
        when m.resource_type='card' and m.direction='debit' and m.classification='purchase' then 'card_purchases'
        when m.resource_type='account' and m.direction='debit' then 'account_debits'
        when m.direction='credit' then 'credits' else 'other' end as kind
    from open_finance.movements m
    join open_finance.resources r on r.id=m.resource_id and r.user_id=m.user_id and r.environment=m.environment and r.mode=m.mode
    join open_finance.connections c on c.id=r.connection_id and c.user_id=r.user_id and c.environment=r.environment and c.mode=r.mode
    where m.user_id=p_user and m.environment='production' and m.mode=p_mode and m.transaction_date between p_from and p_to
  ), page as (
    select * from scoped where p_after is null or (transaction_date,id)<(after_date,p_after)
    order by transaction_date desc,id desc limit 51
  ), visible as (select * from page order by transaction_date desc,id desc limit 50), totals as (
    select kind,currency,sum(amount)::text as amount,count(*) as count,count(*) filter(where amount is null) as missing_amounts
    from scoped group by kind,currency
  ) select jsonb_build_object(
    'from',p_from,'to',p_to,'history_complete',false,
    'totals',coalesce((select jsonb_agg(to_jsonb(t) order by t.kind,t.currency)from totals t),'[]'::jsonb),
    'movements',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'resource_name',v.resource_name,'institution_name',v.institution_name,'resource_type',v.resource_type,'date',v.transaction_date,'description',v.description,'amount',v.amount::text,'currency',v.currency,'direction',v.direction,'classification',v.classification,'kind',v.kind,'bill_month',v.bill_month,'installment_number',v.installment_number,'installment_count',v.installment_count) order by v.transaction_date desc,v.id desc)from visible v),'[]'::jsonb),
    'next',case when(select count(*) from page)>50 then(select id from visible order by transaction_date,id limit 1)else null end,
    'missing_dates',(select count(*) from open_finance.movements where user_id=p_user and environment='production' and mode=p_mode and transaction_date is null),
    'sync_pending',exists(select 1 from open_finance.sync_jobs j where j.user_id=p_user and j.environment='production' and j.mode=p_mode and (
      j.status in ('pending','running') or (j.status='failed' and not exists(select 1 from open_finance.sync_jobs newer where newer.connection_id=j.connection_id and newer.kind=j.kind and newer.family=j.family and newer.external_resource_id=j.external_resource_id and newer.filter_window=j.filter_window and newer.status='complete' and newer.updated_at>j.updated_at))
    )),
    'last_successful_sync_at',(select max(last_successful_sync_at)from open_finance.connections where user_id=p_user and environment='production' and mode=p_mode)
  ) into result;
  return result;
end;$$;
revoke all on function public.zelo_of_overview(uuid,text,text),public.zelo_of_report(uuid,text,date,date,uuid) from public,anon,authenticated;
grant execute on function public.zelo_of_overview(uuid,text,text),public.zelo_of_report(uuid,text,date,date,uuid) to service_role;
commit;
