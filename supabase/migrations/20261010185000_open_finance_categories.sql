begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
-- Local choice stays separate from provider metadata and is not overwritten by sync.
alter table open_finance.movements add column user_category text
  check (user_category is null or (length(btrim(user_category)) between 1 and 100 and user_category=btrim(user_category)));
comment on column open_finance.movements.user_category is 'Category chosen in Zelo. Provider category and source financial data remain unchanged.';

create function public.zelo_of_set_movement_category(p_user uuid,p_mode text,p_movement uuid,p_category text) returns boolean
language plpgsql security definer set search_path=pg_catalog set row_security=off as $$
begin
  perform open_finance.require_access(p_user,p_mode);
  if p_category is not null and (length(btrim(p_category)) not between 1 and 100 or p_category<>btrim(p_category)) then raise exception 'OF_CATEGORY_INVALID';end if;
  update open_finance.movements set user_category=p_category
    where id=p_movement and user_id=p_user and environment='production' and mode=p_mode;
  return found;
end;$$;
revoke all on function public.zelo_of_set_movement_category(uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.zelo_of_set_movement_category(uuid,text,uuid,text) to service_role;

create or replace function public.zelo_of_report(p_user uuid,p_mode text,p_from date,p_to date,p_after uuid default null) returns jsonb
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
    'movements',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'resource_name',v.resource_name,'institution_name',v.institution_name,'resource_type',v.resource_type,'date',v.transaction_date,'description',v.description,'amount',v.amount::text,'currency',v.currency,'direction',v.direction,'classification',v.classification,'kind',v.kind,'source_category',v.source_category,'user_category',v.user_category,'bill_month',v.bill_month,'installment_number',v.installment_number,'installment_count',v.installment_count) order by v.transaction_date desc,v.id desc)from visible v),'[]'::jsonb),
    'next',case when(select count(*) from page)>50 then(select id from visible order by transaction_date,id limit 1)else null end,
    'missing_dates',(select count(*) from open_finance.movements where user_id=p_user and environment='production' and mode=p_mode and transaction_date is null),
    'sync_pending',exists(select 1 from open_finance.sync_jobs j where j.user_id=p_user and j.environment='production' and j.mode=p_mode and (
      j.status in ('pending','running') or (j.status='failed' and not exists(select 1 from open_finance.sync_jobs newer where newer.connection_id=j.connection_id and newer.kind=j.kind and newer.family=j.family and newer.external_resource_id=j.external_resource_id and newer.filter_window=j.filter_window and newer.status='complete' and newer.updated_at>j.updated_at))
    )),
    'last_successful_sync_at',(select max(last_successful_sync_at)from open_finance.connections where user_id=p_user and environment='production' and mode=p_mode)
  ) into result;
  return result;
end;$$;
commit;
