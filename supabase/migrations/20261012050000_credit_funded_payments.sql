-- Confirmed card-funded Pix annotations. Bank facts and debts are never rewritten.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
alter table open_finance.movements add constraint movements_credit_pix_scope_key unique(id,user_id,environment,mode);
create table open_finance.credit_pix_links (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.users(id) on delete cascade,
 environment text not null check(environment='production'),
 mode text not null check(mode in ('personal','business')),
 company_id uuid,
 credit_movement uuid not null,
 payment_movement uuid not null,
 gross_amount numeric(24,8) not null check(gross_amount>0 and gross_amount=round(gross_amount,2)),
 payment_amount numeric(24,8) not null check(payment_amount>0 and payment_amount=round(payment_amount,2)),
 charges_amount numeric(24,8) not null check(charges_amount>=0 and charges_amount=round(charges_amount,2)),
 credit_date date not null,
 payment_date date not null,
 confirmed_at timestamptz not null default now(),
 voided_at timestamptz,
 check(credit_movement<>payment_movement and gross_amount=payment_amount+charges_amount),
 check((mode='personal' and company_id is null) or (mode='business' and company_id is not null)),
 foreign key(company_id,user_id) references public.companies(id,user_id),
 foreign key(credit_movement,user_id,environment,mode) references open_finance.movements(id,user_id,environment,mode) on delete cascade,
 foreign key(payment_movement,user_id,environment,mode) references open_finance.movements(id,user_id,environment,mode) on delete cascade
);
create unique index credit_pix_active_credit on open_finance.credit_pix_links(credit_movement) where voided_at is null;
create unique index credit_pix_active_payment on open_finance.credit_pix_links(payment_movement) where voided_at is null;
create index credit_pix_owner on open_finance.credit_pix_links(user_id,environment,mode,company_id);
alter table open_finance.credit_pix_links enable row level security;
alter table open_finance.credit_pix_links force row level security;
revoke all on open_finance.credit_pix_links from public,anon,authenticated,service_role;
create policy zelo_workspace on open_finance.credit_pix_links for all to zelo_of_workspace
 using(open_finance.company_visible(user_id,mode,company_id)) with check(open_finance.company_visible(user_id,mode,company_id));
grant select,insert,update on open_finance.credit_pix_links to zelo_of_workspace;
comment on table open_finance.credit_pix_links is 'Holder-confirmed Pix funded by card credit; reversible spending annotation, same retention as source movements. No inferred links or money movement.';

create function public.zelo_of_confirm_credit_pix(p_user uuid,p_mode text,p_credit uuid,p_payment uuid,p_gross numeric,p_payment_amount numeric,p_charges numeric,p_confirmed boolean,p_credit_date date,p_payment_date date) returns jsonb
language plpgsql security definer set search_path=pg_catalog set row_security=on as $$
declare a open_finance.movements;b open_finance.movements;existing open_finance.credit_pix_links;selected uuid;new_id uuid;
begin
 perform open_finance.require_access(p_user,p_mode);
 selected:=open_finance.selected_company(p_user,p_mode);
 if p_confirmed is distinct from true or p_credit is null or p_payment is null or p_credit=p_payment
   or p_gross is null or p_payment_amount is null or p_charges is null or p_credit_date is null or p_payment_date is null
   or p_gross<=0 or p_payment_amount<=0 or p_charges<0
   or p_gross<>round(p_gross,2) or p_payment_amount<>round(p_payment_amount,2) or p_charges<>round(p_charges,2)
   or p_gross<>p_payment_amount+p_charges then raise exception 'OF_CREDIT_PIX_INVALID';end if;
 -- All writers lock source IDs in the same order. No concurrent double allocation.
 perform 1 from open_finance.movements where id=any(array[p_credit,p_payment]) and user_id=p_user and environment='production' and mode=p_mode and company_id is not distinct from selected order by id for update;
 select * into a from open_finance.movements where id=p_credit and user_id=p_user and environment='production' and mode=p_mode and company_id is not distinct from selected;
 if not found then raise exception 'OF_CREDIT_PIX_NOT_FOUND';end if;
 select * into b from open_finance.movements where id=p_payment and user_id=p_user and environment='production' and mode=p_mode and company_id is not distinct from selected;
 if not found then raise exception 'OF_CREDIT_PIX_NOT_FOUND';end if;
 if a.resource_type<>'card' or a.direction<>'debit' or a.source_type is distinct from 'OPERACOES_CREDITO_CONTRATADAS_CARTAO'
   or b.resource_type<>'account' or b.direction<>'debit' or b.source_type is distinct from 'PIX'
   or a.classification in ('bill_payment','transfer','investment') or b.classification in ('bill_payment','transfer','investment')
   or a.currency is distinct from 'BRL' or b.currency is distinct from 'BRL' or a.amount is distinct from p_gross or b.amount is distinct from p_payment_amount
   or a.transaction_date is distinct from p_credit_date or b.transaction_date is distinct from p_payment_date then raise exception 'OF_CREDIT_PIX_FACTS_CHANGED';end if;
 select * into existing from open_finance.credit_pix_links where voided_at is null and (credit_movement=p_credit or payment_movement=p_payment);
 if found then
   if existing.credit_movement=p_credit and existing.payment_movement=p_payment and existing.gross_amount=p_gross and existing.payment_amount=p_payment_amount and existing.charges_amount=p_charges and existing.credit_date=a.transaction_date and existing.payment_date=b.transaction_date then return jsonb_build_object('id',existing.id);end if;
   raise exception 'OF_CREDIT_PIX_ALREADY_LINKED';
 end if;
 insert into open_finance.credit_pix_links(user_id,environment,mode,company_id,credit_movement,payment_movement,gross_amount,payment_amount,charges_amount,credit_date,payment_date)
 values(p_user,'production',p_mode,selected,p_credit,p_payment,p_gross,p_payment_amount,p_charges,a.transaction_date,b.transaction_date) returning id into new_id;
 return jsonb_build_object('id',new_id);
end;$$;

create function public.zelo_of_undo_credit_pix(p_user uuid,p_mode text,p_reconciliation uuid) returns boolean
language plpgsql security definer set search_path=pg_catalog set row_security=on as $$
declare link open_finance.credit_pix_links;
begin
 perform open_finance.require_access(p_user,p_mode);
 select * into link from open_finance.credit_pix_links where id=p_reconciliation and user_id=p_user and environment='production' and mode=p_mode and company_id is not distinct from open_finance.selected_company(p_user,p_mode);
 if not found then return false;end if;
 perform 1 from open_finance.movements where id=any(array[link.credit_movement,link.payment_movement]) order by id for update;
 update open_finance.credit_pix_links set voided_at=coalesce(voided_at,now()) where id=link.id;
 return true;
end;$$;

do $$begin execute format('grant zelo_of_workspace to %I',current_user);end;$$;
grant create on schema public to zelo_of_workspace;
alter function public.zelo_of_confirm_credit_pix(uuid,text,uuid,uuid,numeric,numeric,numeric,boolean,date,date) owner to zelo_of_workspace;
alter function public.zelo_of_undo_credit_pix(uuid,text,uuid) owner to zelo_of_workspace;
revoke all on function public.zelo_of_confirm_credit_pix(uuid,text,uuid,uuid,numeric,numeric,numeric,boolean,date,date),public.zelo_of_undo_credit_pix(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.zelo_of_confirm_credit_pix(uuid,text,uuid,uuid,numeric,numeric,numeric,boolean,date,date),public.zelo_of_undo_credit_pix(uuid,text,uuid) to service_role;

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
revoke create on schema public from zelo_of_workspace;
do $$begin execute format('revoke zelo_of_workspace from %I',current_user);end;$$;
commit;
