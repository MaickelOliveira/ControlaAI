-- Private predictions and per-recipient financial notice receipts; no synthetic expenses.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
alter table open_finance.bills add column payment_amount numeric(24,8) check(payment_amount>=0);
alter table open_finance.bills add column payment_evidence boolean not null default false;
alter table open_finance.sync_jobs drop constraint sync_jobs_kind_check;
alter table open_finance.sync_jobs add constraint sync_jobs_kind_check check(kind in ('consent','catalog','transactions','bills','reserves','recurrings','installments','bill-transactions'));
alter table open_finance.sync_jobs drop constraint sync_jobs_check;
alter table open_finance.sync_jobs add constraint sync_jobs_check check((kind='consent' and family='consents') or (kind='catalog' and family<>'consents') or (kind='transactions' and family not in ('consents','loans','financings')) or (kind in ('bills','recurrings','installments','bill-transactions') and family='credit-cards') or (kind='reserves' and family='accounts'));
alter table open_finance.sync_state drop constraint sync_state_stream_check;
alter table open_finance.sync_state add constraint sync_state_stream_check check(stream in ('resources','account.transactions','card.transactions','card.limits','card.bills','investment.transactions','positions','credit','card.recurrings','card.installments','card.bill.transactions'));
create table open_finance.card_schedules(
  id uuid primary key,resource_id uuid not null,user_id uuid not null,environment text not null default 'production' check(environment='production'),mode text not null,
  source_key text not null check(source_key ~ '^[a-f0-9]{64}$'),kind text not null check(kind in ('recurring','installment')),
  description text not null check(length(description) between 1 and 1000),amount numeric(24,8) check(amount>=0),currency text check(currency ~ '^[A-Z]{3}$'),original_currency text check(original_currency ~ '^[A-Z]{3}$'),
  period_months integer check(period_months between 1 and 12),expected_day integer check(expected_day between 1 and 31),first_occurrence_date date,last_occurrence_date date,due_date date,
  regularity_score numeric check(regularity_score between 0 and 1),total_installments integer check(total_installments between 2 and 1000),observed_installments integer check(observed_installments between 1 and total_installments),
  observed_transactions text[] not null check(cardinality(observed_transactions) between 1 and 1000),last_job_id uuid not null references open_finance.sync_jobs(id),synced_at timestamptz not null default now(),
  foreign key(resource_id,user_id,environment,mode) references open_finance.resources(id,user_id,environment,mode) on delete cascade,
  unique(resource_id,kind,source_key)
);
create index card_schedules_owner_due on open_finance.card_schedules(user_id,mode,due_date);
create table open_finance.notice_deliveries(
  id uuid primary key default gen_random_uuid(),user_id uuid not null references public.users(id) on delete cascade,mode text not null check(mode in ('personal','business')),
  item_key text not null check(item_key ~ '^(bill|recurring):[a-f0-9-]{36}$'),occurrence_date date not null,phone text not null check(phone ~ '^[0-9]{8,20}$'),
  status text not null default 'sending' check(status in ('sending','sent','uncertain','skipped')),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  unique(user_id,mode,item_key,occurrence_date,phone)
);
alter table open_finance.card_schedules enable row level security;
alter table open_finance.card_schedules force row level security;
alter table open_finance.notice_deliveries enable row level security;
alter table open_finance.notice_deliveries force row level security;
revoke all on open_finance.card_schedules,open_finance.notice_deliveries from public,anon,authenticated,service_role;
create or replace function public.zelo_of_enqueue(p_user uuid,p_mode text,p_connection uuid,p_job jsonb) returns uuid
language plpgsql security definer set search_path=pg_catalog set row_security=off as $$
declare c open_finance.connections; result uuid; target text;
begin
  perform open_finance.require_access(p_user,p_mode);
  select * into c from open_finance.connections where id=p_connection and user_id=p_user and environment='production' and mode=p_mode for update;
  if c.id is null then raise exception 'OF_CONNECTION_NOT_FOUND'; end if;
  if c.status in ('revoked','revoking') then raise exception 'OF_CONSENT_INACTIVE'; end if;
  if jsonb_typeof(p_job)<>'object' or length(p_job::text)>4000 then raise exception 'OF_JOB_INVALID'; end if;
  if p_job->>'family'<>'consents' and not(case p_job->>'family' when 'accounts' then 'ACCOUNT' when 'credit-cards' then 'CREDIT_CARD_ACCOUNT' when 'loans' then 'CREDIT_OPERATIONS' when 'financings' then 'CREDIT_OPERATIONS' else 'INVESTMENTS' end=any(c.scopes)) then raise exception 'OF_PRODUCT_NOT_AUTHORIZED'; end if;
  if p_job->>'kind' in ('recurrings','installments','bill-transactions') and p_job->>'family' is distinct from 'credit-cards' then raise exception 'OF_JOB_INVALID'; end if;
  if p_job->>'kind'='bill-transactions' and not exists(select 1 from open_finance.bills b join open_finance.resources r on r.id=b.resource_id where b.user_id=p_user and b.mode=p_mode and b.environment='production' and r.connection_id=c.id and r.external_id=p_job->>'external_resource_id' and b.external_id=p_job->'window'->>'billId') then raise exception 'OF_BILL_NOT_FOUND'; end if;
  if exists(select 1 from jsonb_each(coalesce(p_job->'window','{}')) where (key not in ('fromCreatedAt','toCreatedAt','fromUpdatedAt','toUpdatedAt') and not(key='billId' and p_job->>'kind'='bill-transactions')) or jsonb_typeof(value)<>'string') then raise exception 'OF_JOB_INVALID'; end if;
  target:=p_job->>'external_resource_id';
  if p_job->>'kind' in ('consent','catalog') then
    if target is distinct from c.external_consent_id or (p_job->>'kind'='consent' and p_job->>'family'<>'consents') then raise exception 'OF_JOB_INVALID'; end if;
  elsif not exists(select 1 from open_finance.resources where connection_id=c.id and user_id=p_user and environment='production' and mode=p_mode and external_id=target and subtype=p_job->>'family') then raise exception 'OF_RESOURCE_NOT_FOUND'; end if;
  -- Balance updates do not trigger a full history download after initial import.
  if p_job->>'initial_only'='true' and exists(select 1 from open_finance.sync_jobs where connection_id=c.id and kind=p_job->>'kind' and family=p_job->>'family' and external_resource_id=target and filter_window=coalesce(p_job->'window','{}') and status='complete') then return null; end if;
  insert into open_finance.sync_jobs(connection_id,user_id,mode,kind,family,external_resource_id,filter_window)
  values(c.id,p_user,p_mode,p_job->>'kind',p_job->>'family',target,coalesce(p_job->'window','{}'))
  on conflict(connection_id,kind,family,external_resource_id,filter_window) where status in ('pending','running') do update
    set rerun_requested=sync_jobs.rerun_requested or sync_jobs.status='running' or sync_jobs.pages>0,updated_at=now()
  returning id into result;
  return result;
end $$;

create or replace function public.zelo_of_commit_page(p_user uuid,p_mode text,p_job uuid,p_lease uuid,p_rows jsonb,p_next text,p_children jsonb) returns void
language plpgsql security definer set search_path=pg_catalog set row_security=off as $$
declare c open_finance.connections; j open_finance.sync_jobs; row jsonb; scoped jsonb; existing open_finance.resources;
  r open_finance.resources; l open_finance.card_limits; b open_finance.bills; m open_finance.movements; d open_finance.credit_details; s open_finance.card_schedules; previous_schedule open_finance.card_schedules;
  v_resource_id uuid; v_parent_id uuid; v_bill_id uuid; state text; stream_name text; key_name text; child jsonb; result_status text;
begin
  perform open_finance.require_access(p_user,p_mode);
  select x.* into c from open_finance.connections x join open_finance.sync_jobs q on q.connection_id=x.id where q.id=p_job and q.user_id=p_user and q.environment='production' and q.mode=p_mode for update of x;
  if c.id is null then raise exception 'OF_JOB_NOT_FOUND'; end if;
  if c.status in ('revoked','revoking') then raise exception 'OF_CONSENT_INACTIVE'; end if;
  select * into j from open_finance.sync_jobs where id=p_job for update;
  if j.status<>'running' or j.lease_token is distinct from p_lease or j.lease_until<=now() then raise exception 'OF_LEASE_INVALID'; end if;
  if j.kind<>'consent' and c.status<>'active' then raise exception 'OF_CONSENT_INACTIVE'; end if;
  if length(p_rows::text)>2000000 or jsonb_typeof(p_rows)<>'object' or jsonb_typeof(p_children)<>'array' or jsonb_array_length(p_children)>4000 then raise exception 'OF_PAGE_INVALID'; end if;
  if p_next is not null and (p_next=j.cursor or p_next=any(j.seen_cursors) or length(p_next)>1000 or p_next='') then raise exception 'OF_CURSOR_CYCLE'; end if;
  if j.pages>=10000 then raise exception 'OF_PAGE_LIMIT'; end if;
  scoped:=jsonb_build_object('user_id',p_user,'environment','production','mode',p_mode,'synced_at',now(),'updated_at',now(),'created_at',now());

  for row in select value from jsonb_array_elements(coalesce(p_rows->'resources','[]')) loop
    if j.kind not in ('catalog','reserves') or (j.kind='catalog' and (row->>'subtype' is distinct from j.family or row->>'resource_type' is distinct from case j.family when 'accounts' then 'account' when 'credit-cards' then 'card' when 'loans' then 'loan' when 'financings' then 'financing' else 'investment' end)) or (j.kind='reserves' and (row->>'resource_type' is distinct from 'reserve' or row->>'parent_external_id' is distinct from j.external_resource_id)) then raise exception 'OF_RESOURCE_INVALID'; end if;
    select * into existing from open_finance.resources where user_id=p_user and environment='production' and resource_type=row->>'resource_type' and external_id=row->>'external_id';
    if existing.id is not null and existing.mode<>p_mode then raise exception 'OF_RESOURCE_SCOPE_CONFLICT'; end if;
    v_parent_id:=null;
    if row->>'parent_external_id' is not null then select id into v_parent_id from open_finance.resources where connection_id=c.id and user_id=p_user and environment='production' and mode=p_mode and external_id=row->>'parent_external_id' and resource_type='account';
      if v_parent_id is null then raise exception 'OF_RESOURCE_NOT_FOUND'; end if;
    end if;
    r:=jsonb_populate_record(null::open_finance.resources,open_finance.pick(row,array['external_id','resource_type','name','subtype','card_network','identification_last4','currency','available_amount','gross_amount','net_amount','valuation_date','source_updated_at'])||scoped||jsonb_build_object('id',gen_random_uuid(),'connection_id',c.id,'parent_resource_id',v_parent_id));
    insert into open_finance.resources select (r).* on conflict(user_id,environment,resource_type,external_id) do update set
      connection_id=excluded.connection_id,parent_resource_id=excluded.parent_resource_id,name=excluded.name,subtype=excluded.subtype,card_network=excluded.card_network,identification_last4=excluded.identification_last4,currency=excluded.currency,available_amount=excluded.available_amount,gross_amount=excluded.gross_amount,net_amount=excluded.net_amount,valuation_date=excluded.valuation_date,source_updated_at=excluded.source_updated_at,synced_at=now(),updated_at=now()
      where resources.mode=p_mode and coalesce(resources.source_updated_at,'-infinity'::timestamptz)<=coalesce(excluded.source_updated_at,'-infinity'::timestamptz);
  end loop;
  for row in select value from jsonb_array_elements(coalesce(p_rows->'limits','[]')) loop
    if j.kind<>'catalog' or j.family<>'credit-cards' then raise exception 'OF_PAGE_INVALID'; end if;
    select id into v_resource_id from open_finance.resources where connection_id=c.id and user_id=p_user and environment='production' and mode=p_mode and external_id=row->>'resource_external_id' and resource_type='card';
    if v_resource_id is null then raise exception 'OF_RESOURCE_NOT_FOUND'; end if;
    l:=jsonb_populate_record(null::open_finance.card_limits,open_finance.pick(row,array['line_key','line_name','consolidation_type','limit_type','currency','total_amount','used_amount','available_amount','customized_amount','is_flexible','source_updated_at'])||scoped||jsonb_build_object('id',gen_random_uuid(),'resource_id',v_resource_id,'resource_type','card'));
    insert into open_finance.card_limits select (l).* on conflict(resource_id,line_key,currency) do update set
      line_name=excluded.line_name,consolidation_type=excluded.consolidation_type,limit_type=excluded.limit_type,total_amount=excluded.total_amount,used_amount=excluded.used_amount,available_amount=excluded.available_amount,customized_amount=excluded.customized_amount,is_flexible=excluded.is_flexible,source_updated_at=excluded.source_updated_at,synced_at=now()
      where coalesce(card_limits.source_updated_at,'-infinity'::timestamptz)<=coalesce(excluded.source_updated_at,'-infinity'::timestamptz);
  end loop;
  for row in select value from jsonb_array_elements(coalesce(p_rows->'credit','[]')) loop
    if j.kind<>'catalog' or j.family not in ('loans','financings') then raise exception 'OF_PAGE_INVALID'; end if;
    select id into v_resource_id from open_finance.resources where connection_id=c.id and user_id=p_user and environment='production' and mode=p_mode and external_id=row->>'resource_external_id' and resource_type=row->>'resource_type';
    if v_resource_id is null then raise exception 'OF_RESOURCE_NOT_FOUND'; end if;
    d:=jsonb_populate_record(null::open_finance.credit_details,open_finance.pick(row,array['resource_type','currency','contract_amount','outstanding_amount','next_installment_amount','paid_installments','remaining_installments','due_date','source_updated_at'])||scoped||jsonb_build_object('resource_id',v_resource_id));
    insert into open_finance.credit_details select (d).* on conflict(resource_id) do update set currency=excluded.currency,contract_amount=excluded.contract_amount,outstanding_amount=excluded.outstanding_amount,next_installment_amount=excluded.next_installment_amount,paid_installments=excluded.paid_installments,remaining_installments=excluded.remaining_installments,due_date=excluded.due_date,source_updated_at=excluded.source_updated_at,synced_at=now()
      where coalesce(credit_details.source_updated_at,'-infinity'::timestamptz)<=coalesce(excluded.source_updated_at,'-infinity'::timestamptz);
  end loop;
  for row in select value from jsonb_array_elements(coalesce(p_rows->'bills','[]')) loop
    if j.kind<>'bills' or row->>'resource_external_id' is distinct from j.external_resource_id then raise exception 'OF_PAGE_INVALID'; end if;
    select id into v_resource_id from open_finance.resources where connection_id=c.id and user_id=p_user and environment='production' and mode=p_mode and external_id=row->>'resource_external_id' and resource_type='card';
    if v_resource_id is null then raise exception 'OF_RESOURCE_NOT_FOUND'; end if;
    b:=jsonb_populate_record(null::open_finance.bills,open_finance.pick(row,array['external_id','currency','due_date','total_amount','minimum_payment_amount','installment_allowed','status','source_updated_at','payment_amount','payment_evidence'])||scoped||jsonb_build_object('id',gen_random_uuid(),'resource_id',v_resource_id,'resource_type','card','payment_evidence',coalesce((row->>'payment_evidence')::boolean,false)));
    insert into open_finance.bills select (b).* on conflict(resource_id,external_id) do update set currency=excluded.currency,due_date=excluded.due_date,total_amount=excluded.total_amount,minimum_payment_amount=excluded.minimum_payment_amount,installment_allowed=excluded.installment_allowed,status=excluded.status,payment_amount=excluded.payment_amount,payment_evidence=excluded.payment_evidence,source_updated_at=excluded.source_updated_at,synced_at=now()
      where coalesce(bills.source_updated_at,'-infinity'::timestamptz)<=coalesce(excluded.source_updated_at,'-infinity'::timestamptz);
    update open_finance.movements bank_movement set bill_id=bank_bill.id from open_finance.bills bank_bill where bank_movement.resource_id=v_resource_id and bank_movement.external_bill_id=bank_bill.external_id and bank_bill.resource_id=v_resource_id and bank_movement.user_id=p_user and bank_movement.mode=p_mode and bank_movement.environment='production' and bank_movement.bill_id is null;
  end loop;
  for row in select value from jsonb_array_elements(coalesce(p_rows->'movements','[]')) loop
    if j.kind not in ('transactions','bill-transactions') or row->>'resource_external_id' is distinct from j.external_resource_id then raise exception 'OF_PAGE_INVALID'; end if;
    if j.kind='bill-transactions' and (row->>'resource_type' is distinct from 'card' or row->>'bill_external_id' is distinct from j.filter_window->>'billId') then raise exception 'OF_PAGE_INVALID'; end if;
    select id into v_resource_id from open_finance.resources where connection_id=c.id and user_id=p_user and environment='production' and mode=p_mode and external_id=row->>'resource_external_id' and resource_type=row->>'resource_type';
    if v_resource_id is null then raise exception 'OF_RESOURCE_NOT_FOUND'; end if;
    select id into v_bill_id from open_finance.bills where resource_id=v_resource_id and external_id=row->>'bill_external_id' and user_id=p_user and environment='production' and mode=p_mode;
    m:=jsonb_populate_record(null::open_finance.movements,open_finance.pick(row,array['resource_type','external_id','description','transaction_date','transaction_time','bill_month','amount','currency','original_amount','original_currency','direction','classification','source_type','source_category','installment_number','installment_count','source_updated_at'])||scoped||jsonb_build_object('id',gen_random_uuid(),'resource_id',v_resource_id,'bill_id',v_bill_id,'external_bill_id',row->>'bill_external_id'));
    insert into open_finance.movements select (m).* on conflict(resource_id,external_id) do update set description=excluded.description,transaction_date=excluded.transaction_date,transaction_time=excluded.transaction_time,bill_month=excluded.bill_month,bill_id=coalesce(excluded.bill_id,movements.bill_id),external_bill_id=coalesce(excluded.external_bill_id,movements.external_bill_id),amount=excluded.amount,currency=excluded.currency,original_amount=excluded.original_amount,original_currency=excluded.original_currency,direction=excluded.direction,classification=excluded.classification,source_type=excluded.source_type,source_category=excluded.source_category,installment_number=excluded.installment_number,installment_count=excluded.installment_count,source_updated_at=excluded.source_updated_at,synced_at=now(),updated_at=now()
      where coalesce(movements.source_updated_at,'-infinity'::timestamptz)<=coalesce(excluded.source_updated_at,'-infinity'::timestamptz);
  end loop;


  if j.kind in ('recurrings','installments') then
    select id into v_resource_id from open_finance.resources where connection_id=c.id and user_id=p_user and environment='production' and mode=p_mode and external_id=j.external_resource_id and resource_type='card';
    if v_resource_id is null then raise exception 'OF_RESOURCE_NOT_FOUND'; end if;
    if j.pages=0 then delete from open_finance.card_schedules where resource_id=v_resource_id and last_job_id=j.id; end if;
    for row in select value from jsonb_array_elements(coalesce(p_rows->'schedules','[]')) loop
      if row->>'kind' is distinct from (case j.kind when 'recurrings' then 'recurring' else 'installment' end) then raise exception 'OF_PAGE_INVALID'; end if;
      s:=jsonb_populate_record(null::open_finance.card_schedules,open_finance.pick(row,array['source_key','kind','description','amount','currency','original_currency','period_months','expected_day','first_occurrence_date','last_occurrence_date','due_date','regularity_score','total_installments','observed_installments','observed_transactions'])||scoped||jsonb_build_object('id',md5(v_resource_id::text||j.kind||(row->>'source_key'))::uuid,'resource_id',v_resource_id,'last_job_id',j.id));
      -- Provider patterns have no immutable ID. Preserve an identity while their
      -- observed transaction sets overlap, including value/history revisions.
      if (select count(*) from open_finance.card_schedules old where old.resource_id=v_resource_id and old.kind=s.kind and old.observed_transactions && s.observed_transactions)>1 then raise exception 'OF_SCHEDULE_IDENTITY_AMBIGUOUS'; end if;
      select * into previous_schedule from open_finance.card_schedules old where old.resource_id=v_resource_id and old.kind=s.kind and old.observed_transactions && s.observed_transactions;
      if previous_schedule.id is not null then s.id:=previous_schedule.id; s.source_key:=previous_schedule.source_key; end if;
      if exists(select 1 from open_finance.card_schedules where resource_id=v_resource_id and kind=s.kind and source_key=s.source_key and last_job_id=j.id) then raise exception 'OF_DUPLICATE_SCHEDULE'; end if;
      insert into open_finance.card_schedules select (s).* on conflict(resource_id,kind,source_key) do update set
        description=excluded.description,amount=excluded.amount,currency=excluded.currency,original_currency=excluded.original_currency,period_months=excluded.period_months,expected_day=excluded.expected_day,first_occurrence_date=excluded.first_occurrence_date,last_occurrence_date=excluded.last_occurrence_date,due_date=excluded.due_date,regularity_score=excluded.regularity_score,total_installments=excluded.total_installments,observed_installments=excluded.observed_installments,observed_transactions=excluded.observed_transactions,last_job_id=j.id,synced_at=now();
    end loop;
    if (select count(*) from open_finance.card_schedules where last_job_id=j.id)>2000 then raise exception 'OF_PAGE_LIMIT'; end if;
    if p_next is null and not j.rerun_requested then delete from open_finance.card_schedules where resource_id=v_resource_id and kind=case j.kind when 'recurrings' then 'recurring' else 'installment' end and last_job_id<>j.id; end if;
  elsif jsonb_array_length(coalesce(p_rows->'schedules','[]'))>0 then raise exception 'OF_PAGE_INVALID';
  end if;

  if j.kind='consent' then
    result_status:=p_rows->>'consent_status';
    if result_status not in ('pending','active','expired','error') or result_status is null then raise exception 'OF_STATUS_INVALID'; end if;
    update open_finance.connections set status=result_status,provider_status=p_rows->>'provider_status',sync_notes=array(select jsonb_array_elements_text(coalesce(p_rows->'sync_notes','[]'))),updated_at=now() where id=c.id;
  end if;
  for child in select value from jsonb_array_elements(p_children) loop perform public.zelo_of_enqueue(p_user,p_mode,c.id,child); end loop;
  state:=case when p_next is not null or j.rerun_requested then 'pending' else 'complete' end;
  update open_finance.sync_jobs set status=state,cursor=case when p_next is null and j.rerun_requested then null else p_next end,
    seen_cursors=case when p_next is null and j.rerun_requested then '{}' else seen_cursors||coalesce(array[p_next],'{}') end,
    pages=case when p_next is null and j.rerun_requested then 0 else pages+1 end,
    rerun_requested=case when p_next is null then false else rerun_requested end,lease_token=null,lease_until=null,attempts=0,error_code=null,updated_at=now() where id=j.id;
  stream_name:=case j.kind when 'recurrings' then 'card.recurrings' when 'installments' then 'card.installments' when 'bill-transactions' then 'card.bill.transactions' when 'catalog' then 'resources' when 'bills' then 'card.bills' when 'transactions' then case j.family when 'accounts' then 'account.transactions' when 'credit-cards' then 'card.transactions' else 'investment.transactions' end else 'positions' end;
  key_name:=j.family||':'||md5(j.external_resource_id||j.filter_window::text);
  insert into open_finance.sync_state(connection_id,user_id,environment,mode,stream,scope_key,status,cursor,last_attempt_at,last_successful_sync_at)
    values(c.id,p_user,'production',p_mode,stream_name,key_name,state,p_next,now(),case when state='complete' then now() else null end)
    on conflict(connection_id,stream,scope_key) do update set status=excluded.status,cursor=excluded.cursor,last_attempt_at=now(),last_successful_sync_at=case when excluded.status='complete' then now() else sync_state.last_successful_sync_at end,updated_at=now(),error_code=null;
  if state='complete' and not exists(select 1 from open_finance.sync_jobs q where q.connection_id=c.id and (q.status in ('pending','running') or (q.status='failed' and not exists(select 1 from open_finance.sync_jobs newer where newer.connection_id=q.connection_id and newer.kind=q.kind and newer.family=q.family and newer.external_resource_id=q.external_resource_id and newer.filter_window=q.filter_window and newer.status='complete' and newer.updated_at>q.updated_at)))) then update open_finance.connections set last_successful_sync_at=now() where id=c.id; end if;
end $$;

create or replace function public.zelo_of_fail_job(p_user uuid,p_mode text,p_job uuid,p_lease uuid,p_error text) returns void
language plpgsql security definer set search_path=pg_catalog set row_security=off as $$
declare j open_finance.sync_jobs; stream_name text; connection uuid;
begin
  perform open_finance.require_access(p_user,p_mode);
  if p_error !~ '^[A-Z0-9_]{1,80}$' or p_error is null then raise exception 'OF_ERROR_INVALID'; end if;
  select x.id into connection from open_finance.connections x join open_finance.sync_jobs q on q.connection_id=x.id where q.id=p_job and q.user_id=p_user and q.environment='production' and q.mode=p_mode for update of x;
  if connection is null then return; end if;
  update open_finance.sync_jobs set status=case when attempts>=5 then 'failed' else 'pending' end,available_at=now()+interval '1 minute'*least(30,power(2,attempts)::integer),lease_token=null,lease_until=null,error_code=p_error,updated_at=now()
    where id=p_job and user_id=p_user and environment='production' and mode=p_mode and lease_token=p_lease and status='running' returning * into j;
  if j.id is null then return; end if;
  stream_name:=case j.kind when 'recurrings' then 'card.recurrings' when 'installments' then 'card.installments' when 'bill-transactions' then 'card.bill.transactions' when 'catalog' then 'resources' when 'bills' then 'card.bills' when 'transactions' then case j.family when 'accounts' then 'account.transactions' when 'credit-cards' then 'card.transactions' else 'investment.transactions' end else 'positions' end;
  insert into open_finance.sync_state(connection_id,user_id,environment,mode,stream,scope_key,status,cursor,last_attempt_at,error_code)
    values(j.connection_id,p_user,'production',p_mode,stream_name,j.family||':'||md5(j.external_resource_id||j.filter_window::text),j.status,j.cursor,now(),p_error)
    on conflict(connection_id,stream,scope_key) do update set status=excluded.status,cursor=excluded.cursor,last_attempt_at=now(),error_code=p_error,updated_at=now();
end $$;


create view open_finance.agenda_items as
select b.user_id,b.mode,'bill:'||b.id::text as item_key,b.id,b.resource_id,'bill'::text as kind,'Fatura do cartão'::text as description,r.name as resource_name,c.institution_name,b.due_date,b.total_amount as amount,b.currency,b.synced_at,b.payment_evidence,b.payment_amount,null::integer as total_installments,null::integer as observed_installments,null::numeric as regularity_score
from open_finance.bills b join open_finance.resources r on r.id=b.resource_id join open_finance.connections c on c.id=r.connection_id
where b.environment='production' and 'CREDIT_CARD_ACCOUNT'=any(c.scopes) and c.status='active' and (c.consent_expires_at is null or c.consent_expires_at>now())
union all
select s.user_id,s.mode,s.kind||':'||s.id::text,s.id,s.resource_id,s.kind,s.description,r.name,c.institution_name,s.due_date,s.amount,s.currency,s.synced_at,false,null,s.total_installments,s.observed_installments,s.regularity_score
from open_finance.card_schedules s join open_finance.resources r on r.id=s.resource_id join open_finance.connections c on c.id=r.connection_id join open_finance.sync_jobs j on j.id=s.last_job_id
where 'CREDIT_CARD_ACCOUNT'=any(c.scopes) and c.status='active' and (c.consent_expires_at is null or c.consent_expires_at>now()) and j.status='complete' and not exists(select 1 from open_finance.sync_jobs newer where newer.connection_id=j.connection_id and newer.kind=j.kind and newer.external_resource_id=j.external_resource_id and newer.status='complete' and newer.updated_at>j.updated_at);
revoke all on open_finance.agenda_items from public,anon,authenticated,service_role;

create function public.zelo_of_agenda(p_user uuid,p_mode text,p_from date,p_to date,p_undated boolean default false) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog set row_security=off as $$
declare result jsonb;
begin
  perform open_finance.require_access(p_user,p_mode);
  if p_from is null or p_to is null or p_to<p_from or p_to-p_from>800 then raise exception 'OF_PERIOD_INVALID'; end if;
  with scoped as (select * from open_finance.agenda_items where user_id=p_user and mode=p_mode and (due_date between p_from and p_to or (p_undated and due_date is null))),
  visible as (select * from scoped order by due_date nulls last,id limit 2000)
  select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(v)-'user_id'-'item_key'-'amount'-'payment_amount'||jsonb_build_object('amount',v.amount::text,'payment_amount',v.payment_amount::text) order by v.due_date nulls last,v.id) from visible v),'[]'),
    'incomplete',(select count(*)>2000 from scoped) or exists(select 1 from open_finance.sync_jobs j join open_finance.connections c on c.id=j.connection_id where j.user_id=p_user and j.mode=p_mode and j.family='credit-cards' and c.status='active' and j.status in ('pending','running','failed') and not exists(select 1 from open_finance.sync_jobs newer where newer.connection_id=j.connection_id and newer.kind=j.kind and newer.external_resource_id=j.external_resource_id and newer.filter_window=j.filter_window and newer.status='complete' and newer.updated_at>j.updated_at))) into result;
  return result;
end $$;

create function public.zelo_of_notice_targets(p_owner_email text default null) returns jsonb
language sql stable security definer set search_path=pg_catalog set row_security=off as $$
  select coalesce(jsonb_agg(to_jsonb(t)),'[]') from (
    select i.user_id as "userId",i.mode,i.item_key as "itemKey",p.phone
    from open_finance.agenda_items i join open_finance.user_access a on a.user_id=i.user_id join public.users u on u.id=i.user_id join public.wpp_phone_links p on p.user_id=i.user_id
    where i.kind in ('bill','recurring') and i.due_date=(now() at time zone 'America/Sao_Paulo')::date and i.amount>0 and i.synced_at between now()-interval '36 hours' and now()
      and (i.kind<>'recurring' or i.regularity_score>=0.8)
      and a.enabled and a.country_code='BR' and a.country_verified_at is not null and u.status='active'
      and (i.mode='personal' or u.plan='business' or (nullif(btrim(p_owner_email),'') is not null and lower(btrim(u.email))=lower(btrim(p_owner_email))))
      and p.access in (i.mode,'both') and p.phone ~ '^[0-9]{8,20}$'
      and not exists(select 1 from open_finance.notice_deliveries d where d.user_id=i.user_id and d.mode=i.mode and d.item_key=i.item_key and d.occurrence_date=i.due_date and d.phone=p.phone)
    order by i.due_date,i.user_id,i.mode,i.item_key,p.phone limit 20
  ) t;
$$;

create function public.zelo_of_notice_claim(p_user uuid,p_mode text,p_item text,p_phone text,p_owner_email text default null) returns uuid
language plpgsql security definer set search_path=pg_catalog set row_security=off as $$
declare notice uuid; item open_finance.agenda_items;
begin
  perform open_finance.require_access(p_user,p_mode);
  if not exists(select 1 from public.users where id=p_user and status='active' and (p_mode='personal' or plan='business' or (nullif(btrim(p_owner_email),'') is not null and lower(btrim(email))=lower(btrim(p_owner_email))))) then return null; end if;
  if not exists(select 1 from public.wpp_phone_links where user_id=p_user and phone=p_phone and access in (p_mode,'both')) then return null; end if;
  select * into item from open_finance.agenda_items where user_id=p_user and mode=p_mode and item_key=p_item and due_date=(now() at time zone 'America/Sao_Paulo')::date and amount>0 and synced_at between now()-interval '36 hours' and now() and (kind='bill' or (kind='recurring' and regularity_score>=0.8));
  if item.id is null then return null; end if;
  insert into open_finance.notice_deliveries(user_id,mode,item_key,occurrence_date,phone) values(p_user,p_mode,p_item,item.due_date,p_phone) on conflict do nothing returning id into notice;
  return notice;
end $$;

create function public.zelo_of_notice_finish(p_user uuid,p_mode text,p_receipt uuid,p_status text) returns void
language plpgsql security definer set search_path=pg_catalog set row_security=off as $$
begin
  if p_status is null or p_status not in ('sent','uncertain','skipped') then raise exception 'OF_STATUS_INVALID'; end if;
  update open_finance.notice_deliveries set status=p_status,updated_at=now() where id=p_receipt and user_id=p_user and mode=p_mode and status='sending';
end $$;
revoke all on function public.zelo_of_agenda(uuid,text,date,date,boolean),public.zelo_of_notice_targets(text),public.zelo_of_notice_claim(uuid,text,text,text,text),public.zelo_of_notice_finish(uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.zelo_of_agenda(uuid,text,date,date,boolean),public.zelo_of_notice_targets(text),public.zelo_of_notice_claim(uuid,text,text,text,text),public.zelo_of_notice_finish(uuid,text,uuid,text) to service_role;

alter function public.zelo_of_overview(uuid,text,text) rename to zelo_of_overview_v5;
revoke all on function public.zelo_of_overview_v5(uuid,text,text) from public,anon,authenticated,service_role;
create function public.zelo_of_overview(p_user uuid,p_environment text,p_mode text) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog set row_security=off as $$
declare result jsonb;
begin
  result:=public.zelo_of_overview_v5(p_user,p_environment,p_mode);
  return result||jsonb_build_object(
    'connections',(select coalesce(jsonb_agg(e||jsonb_build_object('institution_id',c.institution_id)),'[]') from jsonb_array_elements(result->'connections') e join open_finance.connections c on c.id=(e->>'id')::uuid),
    'bills',(select coalesce(jsonb_agg(e||jsonb_build_object('payment_amount',b.payment_amount::text,'payment_evidence',b.payment_evidence,'synced_at',b.synced_at)),'[]') from jsonb_array_elements(result->'bills') e join open_finance.bills b on b.id=(e->>'id')::uuid),
    'agenda',public.zelo_of_agenda(p_user,p_mode,(now() at time zone 'America/Sao_Paulo')::date-365,(now() at time zone 'America/Sao_Paulo')::date+365,true));
end $$;
revoke all on function public.zelo_of_overview(uuid,text,text) from public,anon,authenticated;
grant execute on function public.zelo_of_overview(uuid,text,text) to service_role;

-- At most 20 cards per maintenance pass; each product refreshes at most twice daily.
create function public.zelo_of_prepare_schedules(p_owner_email text default null) returns integer
language plpgsql security definer set search_path=pg_catalog set row_security=off as $$
declare r record; k text; queued integer:=0;
begin
  for r in select resource.id,resource.user_id,resource.mode,resource.connection_id,resource.external_id from open_finance.resources resource
    join open_finance.connections c on c.id=resource.connection_id join open_finance.user_access a on a.user_id=resource.user_id join public.users u on u.id=resource.user_id
    where resource.resource_type='card' and resource.environment='production' and 'CREDIT_CARD_ACCOUNT'=any(c.scopes) and c.status='active' and (c.consent_expires_at is null or c.consent_expires_at>now()) and a.enabled and a.country_code='BR' and a.country_verified_at is not null and u.status='active'
      and (resource.mode='personal' or u.plan='business' or (nullif(btrim(p_owner_email),'') is not null and lower(btrim(u.email))=lower(btrim(p_owner_email))))
      and exists(select 1 from unnest(array['recurrings','installments','bills']) needed(kind) where not exists(select 1 from open_finance.sync_jobs j where j.connection_id=c.id and j.external_resource_id=resource.external_id and j.kind=needed.kind and (j.status in ('pending','running') or j.updated_at>now()-interval '12 hours')))
    order by resource.synced_at,resource.id limit 20
  loop
    for k in select unnest(array['recurrings','installments','bills']) loop
      if not exists(select 1 from open_finance.sync_jobs where connection_id=r.connection_id and external_resource_id=r.external_id and kind=k and (status in ('pending','running') or updated_at>now()-interval '12 hours')) then
        perform public.zelo_of_enqueue(r.user_id,r.mode,r.connection_id,jsonb_build_object('kind',k,'family','credit-cards','external_resource_id',r.external_id,'window','{}'::jsonb));queued:=queued+1;
      end if;
    end loop;
  end loop;
  return queued;
end $$;

create function public.zelo_of_bill(p_user uuid,p_mode text,p_bill uuid,p_after uuid default null) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog set row_security=off as $$
declare b open_finance.bills; r open_finance.resources; c open_finance.connections; result jsonb;
begin
  perform open_finance.require_access(p_user,p_mode);
  select * into b from open_finance.bills where id=p_bill and user_id=p_user and environment='production' and mode=p_mode;
  if b.id is null then raise exception 'OF_BILL_NOT_FOUND'; end if;
  select * into r from open_finance.resources where id=b.resource_id;select * into c from open_finance.connections where id=r.connection_id;
  if p_after is not null and not exists(select 1 from open_finance.movements where id=p_after and bill_id=b.id and resource_id=r.id and user_id=p_user and mode=p_mode) then raise exception 'OF_CURSOR_INVALID'; end if;
  with visible as (select * from open_finance.movements where bill_id=b.id and resource_id=r.id and user_id=p_user and environment='production' and mode=p_mode and (p_after is null or id>p_after) order by id limit 51)
  select jsonb_build_object('bill',jsonb_build_object('id',b.id,'resource_id',r.id,'institution_name',c.institution_name,'resource_name',r.name,'last4',r.identification_last4,'due_date',b.due_date,'currency',b.currency,'total_amount',b.total_amount::text,'minimum_payment_amount',b.minimum_payment_amount::text,'payment_amount',b.payment_amount::text,'payment_evidence',b.payment_evidence,'synced_at',b.synced_at),
    'transactions',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'date',m.transaction_date,'description',m.description,'amount',m.amount::text,'currency',m.currency,'direction',m.direction,'installment_number',m.installment_number,'installment_count',m.installment_count) order by m.id) from (select * from visible order by id limit 50)m),'[]'),
    'next',case when (select count(*) from visible)>50 then (select id::text from visible order by id offset 49 limit 1) else null end,
    'transactions_complete',coalesce((select j.status='complete' from open_finance.sync_jobs j where j.connection_id=c.id and j.kind='bill-transactions' and j.external_resource_id=r.external_id and j.filter_window->>'billId'=b.external_id order by j.created_at desc,j.id desc limit 1),false)) into result;
  return result;
end $$;
revoke all on function public.zelo_of_prepare_schedules(text),public.zelo_of_bill(uuid,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.zelo_of_prepare_schedules(text),public.zelo_of_bill(uuid,text,uuid,uuid) to service_role;
commit;
