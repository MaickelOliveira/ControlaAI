-- Durable metadata queue. No raw webhook, documents or credential storage.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
alter table open_finance.movements add column external_bill_id text check(length(external_bill_id)<=200);
alter table open_finance.connections add column sync_notes text[] not null default '{}';
alter table open_finance.user_access add column last_worker_personal_at timestamptz;
alter table open_finance.user_access add column last_worker_business_at timestamptz;
alter table open_finance.user_access add column next_sync_claim_at timestamptz;
create table open_finance.sync_jobs (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null, user_id uuid not null, environment text not null default 'production' check(environment='production'), mode text not null,
  kind text not null check(kind in ('consent','catalog','transactions','bills','reserves')),
  family text not null check(family in ('consents','accounts','credit-cards','loans','financings','bank-fixed-incomes','credit-fixed-incomes','funds','treasure-titles','variable-incomes')),
  external_resource_id text not null check(external_resource_id ~ '^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,199}$'),
  filter_window jsonb not null default '{}' check(jsonb_typeof(filter_window)='object' and length(filter_window::text)<=2000),
  status text not null default 'pending' check(status in ('pending','running','complete','failed')),
  cursor text check(length(cursor)<=1000), seen_cursors text[] not null default '{}', pages integer not null default 0 check(pages<=10000),
  lease_token uuid, lease_until timestamptz, attempts integer not null default 0, available_at timestamptz not null default now(),
  rerun_requested boolean not null default false, error_code text check(error_code ~ '^[A-Z0-9_]{1,80}$'),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check((kind='consent' and family='consents') or (kind='catalog' and family<>'consents') or (kind='transactions' and family not in ('consents','loans','financings')) or (kind='bills' and family='credit-cards') or (kind='reserves' and family='accounts')),
  foreign key(connection_id,user_id,environment,mode) references open_finance.connections(id,user_id,environment,mode) on delete cascade
);
create unique index sync_jobs_active_idx on open_finance.sync_jobs(connection_id,kind,family,external_resource_id,filter_window) where status in ('pending','running');
create index sync_jobs_ready_idx on open_finance.sync_jobs(user_id,mode,available_at) where status in ('pending','running');
alter table open_finance.sync_jobs enable row level security;
alter table open_finance.sync_jobs force row level security;
revoke all on open_finance.sync_jobs from public,anon,authenticated,service_role;

create function open_finance.pick(p_row jsonb,p_fields text[]) returns jsonb language sql immutable set search_path=pg_catalog as $$
  select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) from jsonb_each(p_row) where key=any(p_fields);
$$;
revoke all on function open_finance.pick(jsonb,text[]) from public,anon,authenticated,service_role;

create function public.zelo_of_enqueue(p_user uuid,p_mode text,p_connection uuid,p_job jsonb) returns uuid
language plpgsql security definer set search_path=pg_catalog set row_security=off as $$
declare c open_finance.connections; result uuid; target text;
begin
  perform open_finance.require_access(p_user,p_mode);
  select * into c from open_finance.connections where id=p_connection and user_id=p_user and environment='production' and mode=p_mode for update;
  if c.id is null then raise exception 'OF_CONNECTION_NOT_FOUND'; end if;
  if c.status in ('revoked','revoking') then raise exception 'OF_CONSENT_INACTIVE'; end if;
  if jsonb_typeof(p_job)<>'object' or length(p_job::text)>4000 then raise exception 'OF_JOB_INVALID'; end if;
  if p_job->>'family'<>'consents' and not(case p_job->>'family' when 'accounts' then 'ACCOUNT' when 'credit-cards' then 'CREDIT_CARD_ACCOUNT' when 'loans' then 'CREDIT_OPERATIONS' when 'financings' then 'CREDIT_OPERATIONS' else 'INVESTMENTS' end=any(c.scopes)) then raise exception 'OF_PRODUCT_NOT_AUTHORIZED'; end if;
  if exists(select 1 from jsonb_each(coalesce(p_job->'window','{}')) where key not in ('fromCreatedAt','toCreatedAt','fromUpdatedAt','toUpdatedAt') or jsonb_typeof(value)<>'string') then raise exception 'OF_JOB_INVALID'; end if;
  target:=p_job->>'external_resource_id';
  if p_job->>'kind' in ('consent','catalog') then
    if target is distinct from c.external_consent_id or (p_job->>'kind'='consent' and p_job->>'family'<>'consents') then raise exception 'OF_JOB_INVALID'; end if;
  elsif not exists(select 1 from open_finance.resources where connection_id=c.id and user_id=p_user and environment='production' and mode=p_mode and external_id=target and subtype=p_job->>'family') then raise exception 'OF_RESOURCE_NOT_FOUND'; end if;
  -- Balance updates do not trigger a full history download after initial import.
  if p_job->>'initial_only'='true' and exists(select 1 from open_finance.sync_jobs where connection_id=c.id and kind=p_job->>'kind' and family=p_job->>'family' and external_resource_id=target and filter_window='{}' and status='complete') then return null; end if;
  insert into open_finance.sync_jobs(connection_id,user_id,mode,kind,family,external_resource_id,filter_window)
  values(c.id,p_user,p_mode,p_job->>'kind',p_job->>'family',target,coalesce(p_job->'window','{}'))
  on conflict(connection_id,kind,family,external_resource_id,filter_window) where status in ('pending','running') do update
    set rerun_requested=sync_jobs.rerun_requested or sync_jobs.status='running' or sync_jobs.pages>0,updated_at=now()
  returning id into result;
  return result;
end $$;

create function public.zelo_of_webhook_target(p_user uuid,p_mode text,p_reference text,p_family text) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog set row_security=off as $$
declare c open_finance.connections;
begin
  perform open_finance.require_access(p_user,p_mode);
  if p_family='consents' then select * into c from open_finance.connections where user_id=p_user and environment='production' and external_consent_id=p_reference;
  else select x.* into c from open_finance.connections x join open_finance.resources r on r.connection_id=x.id where r.user_id=p_user and r.environment='production' and r.external_id=p_reference and r.subtype=p_family; end if;
  if c.id is null then return null; end if;
  perform open_finance.require_access(p_user,c.mode);
  return jsonb_build_object('id',c.id,'mode',c.mode,'status',c.status);
end $$;

create function public.zelo_of_claim(p_user uuid,p_mode text) returns jsonb
language plpgsql security definer set search_path=pg_catalog set row_security=off as $$
declare c open_finance.connections; j open_finance.sync_jobs; next_claim timestamptz;
begin
  perform open_finance.require_access(p_user,p_mode);
  select next_sync_claim_at into next_claim from open_finance.user_access where user_id=p_user for update;
  update open_finance.user_access set last_worker_personal_at=case when p_mode='personal' then now() else last_worker_personal_at end,last_worker_business_at=case when p_mode='business' then now() else last_worker_business_at end where user_id=p_user;
  if next_claim>now() or exists(select 1 from open_finance.sync_jobs q join open_finance.connections x on x.id=q.connection_id where q.user_id=p_user and q.status='running' and q.lease_until>now() and x.status not in ('revoked','revoking')) then return null; end if;
  -- All writers lock connection before job; revocation cannot race a page commit.
  select x.* into c from open_finance.connections x where x.user_id=p_user and x.environment='production' and x.mode=p_mode and x.status not in ('revoked','revoking') and exists(
    select 1 from open_finance.sync_jobs q where q.connection_id=x.id and q.available_at<=now() and (q.status='pending' or (q.status='running' and q.lease_until<now())) and (x.status='active' or q.kind='consent')
  ) order by x.created_at for update skip locked limit 1;
  if c.id is null then return null; end if;
  select * into j from open_finance.sync_jobs where connection_id=c.id and available_at<=now() and (status='pending' or (status='running' and lease_until<now())) and (c.status='active' or kind='consent') order by created_at for update skip locked limit 1;
  if j.id is null then return null; end if;
  update open_finance.user_access set next_sync_claim_at=now()+interval '1 second' where user_id=p_user;
  update open_finance.sync_jobs set status='running',lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes',attempts=attempts+1,updated_at=now() where id=j.id returning * into j;
  return to_jsonb(j)||jsonb_build_object('external_consent_id',c.external_consent_id,'institution_id',c.institution_id,'scopes',to_jsonb(c.scopes));
end $$;

create function public.zelo_of_commit_page(p_user uuid,p_mode text,p_job uuid,p_lease uuid,p_rows jsonb,p_next text,p_children jsonb) returns void
language plpgsql security definer set search_path=pg_catalog set row_security=off as $$
declare c open_finance.connections; j open_finance.sync_jobs; row jsonb; scoped jsonb; existing open_finance.resources;
  r open_finance.resources; l open_finance.card_limits; b open_finance.bills; m open_finance.movements; d open_finance.credit_details;
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
    b:=jsonb_populate_record(null::open_finance.bills,open_finance.pick(row,array['external_id','currency','due_date','total_amount','minimum_payment_amount','installment_allowed','status','source_updated_at'])||scoped||jsonb_build_object('id',gen_random_uuid(),'resource_id',v_resource_id,'resource_type','card'));
    insert into open_finance.bills select (b).* on conflict(resource_id,external_id) do update set currency=excluded.currency,due_date=excluded.due_date,total_amount=excluded.total_amount,minimum_payment_amount=excluded.minimum_payment_amount,installment_allowed=excluded.installment_allowed,status=excluded.status,source_updated_at=excluded.source_updated_at,synced_at=now()
      where coalesce(bills.source_updated_at,'-infinity'::timestamptz)<=coalesce(excluded.source_updated_at,'-infinity'::timestamptz);
    update open_finance.movements bank_movement set bill_id=bank_bill.id from open_finance.bills bank_bill where bank_movement.resource_id=v_resource_id and bank_movement.external_bill_id=bank_bill.external_id and bank_bill.resource_id=v_resource_id and bank_movement.user_id=p_user and bank_movement.mode=p_mode and bank_movement.environment='production' and bank_movement.bill_id is null;
  end loop;
  for row in select value from jsonb_array_elements(coalesce(p_rows->'movements','[]')) loop
    if j.kind<>'transactions' or row->>'resource_external_id' is distinct from j.external_resource_id then raise exception 'OF_PAGE_INVALID'; end if;
    select id into v_resource_id from open_finance.resources where connection_id=c.id and user_id=p_user and environment='production' and mode=p_mode and external_id=row->>'resource_external_id' and resource_type=row->>'resource_type';
    if v_resource_id is null then raise exception 'OF_RESOURCE_NOT_FOUND'; end if;
    select id into v_bill_id from open_finance.bills where resource_id=v_resource_id and external_id=row->>'bill_external_id' and user_id=p_user and environment='production' and mode=p_mode;
    m:=jsonb_populate_record(null::open_finance.movements,open_finance.pick(row,array['resource_type','external_id','description','transaction_date','transaction_time','bill_month','amount','currency','original_amount','original_currency','direction','classification','source_type','source_category','installment_number','installment_count','source_updated_at'])||scoped||jsonb_build_object('id',gen_random_uuid(),'resource_id',v_resource_id,'bill_id',v_bill_id,'external_bill_id',row->>'bill_external_id'));
    insert into open_finance.movements select (m).* on conflict(resource_id,external_id) do update set description=excluded.description,transaction_date=excluded.transaction_date,transaction_time=excluded.transaction_time,bill_month=excluded.bill_month,bill_id=excluded.bill_id,external_bill_id=excluded.external_bill_id,amount=excluded.amount,currency=excluded.currency,original_amount=excluded.original_amount,original_currency=excluded.original_currency,direction=excluded.direction,classification=excluded.classification,source_type=excluded.source_type,source_category=excluded.source_category,installment_number=excluded.installment_number,installment_count=excluded.installment_count,source_updated_at=excluded.source_updated_at,synced_at=now(),updated_at=now()
      where coalesce(movements.source_updated_at,'-infinity'::timestamptz)<=coalesce(excluded.source_updated_at,'-infinity'::timestamptz);
  end loop;

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
  stream_name:=case j.kind when 'catalog' then 'resources' when 'bills' then 'card.bills' when 'transactions' then case j.family when 'accounts' then 'account.transactions' when 'credit-cards' then 'card.transactions' else 'investment.transactions' end else 'positions' end;
  key_name:=j.family||':'||md5(j.external_resource_id||j.filter_window::text);
  insert into open_finance.sync_state(connection_id,user_id,environment,mode,stream,scope_key,status,cursor,last_attempt_at,last_successful_sync_at)
    values(c.id,p_user,'production',p_mode,stream_name,key_name,state,p_next,now(),case when state='complete' then now() else null end)
    on conflict(connection_id,stream,scope_key) do update set status=excluded.status,cursor=excluded.cursor,last_attempt_at=now(),last_successful_sync_at=case when excluded.status='complete' then now() else sync_state.last_successful_sync_at end,updated_at=now(),error_code=null;
  if state='complete' and not exists(select 1 from open_finance.sync_jobs q where q.connection_id=c.id and (q.status in ('pending','running') or (q.status='failed' and not exists(select 1 from open_finance.sync_jobs newer where newer.connection_id=q.connection_id and newer.kind=q.kind and newer.family=q.family and newer.external_resource_id=q.external_resource_id and newer.filter_window=q.filter_window and newer.status='complete' and newer.updated_at>q.updated_at)))) then update open_finance.connections set last_successful_sync_at=now() where id=c.id; end if;
end $$;

create function public.zelo_of_fail_job(p_user uuid,p_mode text,p_job uuid,p_lease uuid,p_error text) returns void
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
  stream_name:=case j.kind when 'catalog' then 'resources' when 'bills' then 'card.bills' when 'transactions' then case j.family when 'accounts' then 'account.transactions' when 'credit-cards' then 'card.transactions' else 'investment.transactions' end else 'positions' end;
  insert into open_finance.sync_state(connection_id,user_id,environment,mode,stream,scope_key,status,cursor,last_attempt_at,error_code)
    values(j.connection_id,p_user,'production',p_mode,stream_name,j.family||':'||md5(j.external_resource_id||j.filter_window::text),j.status,j.cursor,now(),p_error)
    on conflict(connection_id,stream,scope_key) do update set status=excluded.status,cursor=excluded.cursor,last_attempt_at=now(),error_code=p_error,updated_at=now();
end $$;

create function public.zelo_of_retry_failed(p_user uuid,p_mode text,p_connection uuid) returns integer
language plpgsql security definer set search_path=pg_catalog set row_security=off as $$
declare c open_finance.connections; j open_finance.sync_jobs; retried integer:=0;
begin
  perform open_finance.require_access(p_user,p_mode);
  select * into c from open_finance.connections where id=p_connection and user_id=p_user and environment='production' and mode=p_mode for update;
  if c.id is null then raise exception 'OF_CONNECTION_NOT_FOUND'; end if;
  if c.status in ('revoked','revoking') then raise exception 'OF_CONSENT_INACTIVE'; end if;
  for j in select q.* from open_finance.sync_jobs q where q.connection_id=c.id and q.status='failed' and not exists(select 1 from open_finance.sync_jobs newer where newer.connection_id=q.connection_id and newer.kind=q.kind and newer.family=q.family and newer.external_resource_id=q.external_resource_id and newer.filter_window=q.filter_window and newer.status='complete' and newer.updated_at>q.updated_at) order by q.updated_at desc loop
    if not exists(select 1 from open_finance.sync_jobs where connection_id=c.id and kind=j.kind and family=j.family and external_resource_id=j.external_resource_id and filter_window=j.filter_window and status in ('pending','running')) then
      update open_finance.sync_jobs set status='pending',attempts=0,error_code=null,available_at=now(),updated_at=now() where id=j.id;
      retried:=retried+1;
    end if;
  end loop;
  return retried;
end $$;

create function public.zelo_of_capabilities(p_user uuid,p_mode text) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog set row_security=off as $$
begin
  perform open_finance.require_access(p_user,p_mode);
  return jsonb_build_object('version','private-sync-v4','worker_recent',coalesce((select (case when p_mode='personal' then last_worker_personal_at else last_worker_business_at end)>now()-interval '3 minutes' from open_finance.user_access where user_id=p_user),false));
end $$;

revoke all on function public.zelo_of_enqueue(uuid,text,uuid,jsonb),public.zelo_of_webhook_target(uuid,text,text,text),public.zelo_of_claim(uuid,text),public.zelo_of_commit_page(uuid,text,uuid,uuid,jsonb,text,jsonb),public.zelo_of_fail_job(uuid,text,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.zelo_of_enqueue(uuid,text,uuid,jsonb),public.zelo_of_webhook_target(uuid,text,text,text),public.zelo_of_claim(uuid,text),public.zelo_of_commit_page(uuid,text,uuid,uuid,jsonb,text,jsonb),public.zelo_of_fail_job(uuid,text,uuid,uuid,text) to service_role;
revoke all on function public.zelo_of_retry_failed(uuid,text,uuid),public.zelo_of_capabilities(uuid,text) from public,anon,authenticated;
grant execute on function public.zelo_of_retry_failed(uuid,text,uuid),public.zelo_of_capabilities(uuid,text) to service_role;
commit;
