-- Purchase and expense are one transaction. No financial backfill is performed.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
alter table public.grocery_purchases add column mode text not null default 'personal' check(mode in ('personal','business'));
alter table public.grocery_purchases add column company_id uuid;
alter table public.grocery_purchases add constraint grocery_company_owner_fk foreign key(company_id,user_id) references public.companies(id,user_id);
update public.grocery_purchases p set mode=f.mode,company_id=f.company_id from public.finances f where p.finance_id=f.id and p.user_id=f.user_id;
create unique index grocery_one_finance_idx on public.grocery_purchases(finance_id) where finance_id is not null;
create index grocery_workspace_idx on public.grocery_purchases(user_id,mode,company_id,date);

-- Operation receipts survive deletion, so a delayed retry cannot recreate a deleted purchase.
create table public.grocery_purchase_operations (
 user_id uuid not null references public.users(id) on delete cascade,
 operation_key text not null, signature text not null,
 purchase_id uuid references public.grocery_purchases(id) on delete set null,
 primary key(user_id,operation_key)
);
alter table public.grocery_purchase_operations enable row level security;
revoke all on public.grocery_purchase_operations from public,anon,authenticated;
grant select,insert,update,delete on public.grocery_purchase_operations to service_role;

create function public.grocery_purchase_guard() returns trigger language plpgsql set search_path=pg_catalog as $$
declare f public.finances%rowtype;
begin
 if tg_op='UPDATE' and (new.id<>old.id or new.user_id<>old.user_id or new.mode<>old.mode or new.company_id is distinct from old.company_id) then raise exception 'GROCERY_REASSIGNMENT_DENIED';end if;
 if tg_op='UPDATE' and new.finance_id is distinct from old.finance_id and current_setting('zelo.grocery_write',true) is distinct from '1' then raise exception 'GROCERY_LINK_IMMUTABLE';end if;
 if tg_op='UPDATE' and old.finance_id is not null and (new.total<>old.total or new.date<>old.date) and current_setting('zelo.grocery_write',true) is distinct from '1' then raise exception 'GROCERY_EDIT_ITEMS';end if;
 if not exists(select 1 from public.grocery_stores s where s.id=new.store_id and s.user_id=new.user_id) then raise exception 'GROCERY_STORE_DENIED';end if;
 if new.finance_id is not null then
  select * into f from public.finances where id=new.finance_id and user_id=new.user_id;
  if not found or f.type<>'expense' or f.mode<>new.mode or f.company_id is distinct from new.company_id then raise exception 'GROCERY_FINANCE_DENIED';end if;
 end if;
 return new;
end;$$;
create trigger grocery_purchase_guard before insert or update on public.grocery_purchases for each row execute function public.grocery_purchase_guard();

create function public.grocery_finance_guard() returns trigger language plpgsql set search_path=pg_catalog as $$
declare p public.grocery_purchases%rowtype;previous_flag text:=coalesce(current_setting('zelo.grocery_write',true),'');
begin
 if tg_op='DELETE' then
  delete from public.grocery_purchases where finance_id=old.id and user_id=old.user_id;
  return old;
 end if;
 select * into p from public.grocery_purchases where finance_id=old.id and user_id=old.user_id;
 if found then
  if new.user_id<>old.user_id or new.id<>old.id or new.type<>'expense' or new.mode<>p.mode or new.company_id is distinct from p.company_id or new.amount is null or new.amount::text in ('NaN','Infinity','-Infinity') or new.amount<=0 or new.amount>99999999 then raise exception 'GROCERY_FINANCE_DENIED';end if;
  if new.amount<>p.total or new.date<>p.date then
   perform set_config('zelo.grocery_write','1',true);
   update public.grocery_purchases set total=new.amount,date=new.date where id=p.id and user_id=p.user_id;
   perform set_config('zelo.grocery_write',previous_flag,true);
  end if;
 end if;
 return new;
end;$$;
create trigger grocery_finance_guard before update or delete on public.finances for each row execute function public.grocery_finance_guard();

create function public.save_grocery_purchase(p_user uuid,p_purchase uuid,p_store uuid,p_date date,p_items jsonb,p_total numeric,p_finance jsonb) returns uuid
language plpgsql set search_path=pg_catalog as $$
declare purchase public.grocery_purchases%rowtype;linked uuid;purchase_id uuid:=coalesce(p_purchase,gen_random_uuid());
 mode_name text:=coalesce(p_finance->>'mode','personal');company uuid:=nullif(p_finance->>'companyId','')::uuid;
 source_name text:=coalesce(p_finance->>'source','web');store_name text;item jsonb;product uuid;account uuid:=nullif(p_finance->>'accountId','')::uuid;
 op_key text:=nullif(p_finance->>'operationKey','');operation_signature text;previous_operation public.grocery_purchase_operations%rowtype;
 checked_ids uuid[];checked_count integer;
 invoice uuid:=nullif(p_finance->>'cardInvoiceId','')::uuid;previous_flag text:=coalesce(current_setting('zelo.grocery_write',true),'');
begin
 if p_user is null or p_date is null or p_total is null or p_total::text in ('NaN','Infinity','-Infinity') or round(p_total,2)<=0 or p_total>99999999 or p_items is null or p_finance is null or jsonb_typeof(p_finance)<>'object' or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 200 or mode_name not in ('personal','business') or source_name not in ('web','whatsapp') then raise exception 'GROCERY_INVALID';end if;
 select name into store_name from public.grocery_stores where id=p_store and user_id=p_user;
 if not found then raise exception 'GROCERY_STORE_DENIED';end if;
 if mode_name='business' and company is null then select id into company from public.companies where user_id=p_user and is_default;end if;
 if mode_name='personal' and company is not null then raise exception 'GROCERY_PLATFORM_DENIED';end if;
 if mode_name='business' and not exists(select 1 from public.companies where id=company and user_id=p_user) then raise exception 'GROCERY_COMPANY_DENIED';end if;
 if account is not null and not exists(select 1 from public.accounts a where a.id=account and a.user_id=p_user and a.mode=mode_name and a.company_id is not distinct from company) then raise exception 'GROCERY_ACCOUNT_DENIED';end if;
 if invoice is not null and not exists(select 1 from public.card_invoices i where i.id=invoice and i.user_id=p_user and i.account_id=account and i.company_id is not distinct from company) then raise exception 'GROCERY_INVOICE_DENIED';end if;
 if op_key is not null and length(op_key) not between 1 and 160 then raise exception 'GROCERY_OPERATION_INVALID';end if;
 if p_purchase is null and op_key is not null then
  perform pg_advisory_xact_lock(hashtextextended(p_user::text||op_key,0));
  operation_signature:=md5(jsonb_build_object('store',p_store,'date',p_date,'items',p_items,'total',round(p_total,2),'finance',p_finance-'operationKey')::text);
  select * into previous_operation from public.grocery_purchase_operations o where o.user_id=p_user and o.operation_key=op_key;
  if found then
   if previous_operation.signature<>operation_signature then raise exception 'GROCERY_OPERATION_CHANGED';end if;
   if previous_operation.purchase_id is null then raise exception 'GROCERY_ALREADY_REMOVED';end if;
   return previous_operation.purchase_id;
  end if;
 end if;
 if p_finance ? 'checkedIds' then
  if p_purchase is not null or jsonb_typeof(p_finance->'checkedIds')<>'array' or jsonb_array_length(p_finance->'checkedIds') not between 1 and 200 then raise exception 'GROCERY_LIST_INVALID';end if;
  select array_agg(value::uuid) into checked_ids from jsonb_array_elements_text(p_finance->'checkedIds');
  if cardinality(checked_ids)<>(select count(distinct x) from unnest(checked_ids) x) then raise exception 'GROCERY_LIST_INVALID';end if;
  perform 1 from public.grocery_shopping_list_items l where l.user_id=p_user and l.id=any(checked_ids) and l.checked for update;
  select count(*) into checked_count from public.grocery_shopping_list_items l where l.user_id=p_user and l.id=any(checked_ids) and l.checked;
  if checked_count<>cardinality(checked_ids) then raise exception 'GROCERY_LIST_CHANGED';end if;
 end if;
 perform set_config('zelo.grocery_write','1',true);
 if p_purchase is not null then
  -- Finance edits hold their row before touching the purchase. Use the same order.
  select finance_id into linked from public.grocery_purchases where id=p_purchase and user_id=p_user;
  if linked is not null then perform 1 from public.finances where id=linked and user_id=p_user for update;end if;
  select * into purchase from public.grocery_purchases where id=p_purchase and user_id=p_user for update;
  if not found or purchase.mode<>mode_name or purchase.company_id is distinct from company then raise exception 'GROCERY_PURCHASE_DENIED';end if;
  linked:=purchase.finance_id;
  update public.grocery_purchases set store_id=p_store,date=p_date,total=round(p_total,2) where id=p_purchase and user_id=p_user;
  delete from public.grocery_purchase_items i where i.purchase_id=p_purchase;
 else
  insert into public.grocery_purchases(id,user_id,store_id,date,total,source,mode,company_id)
   values(purchase_id,p_user,p_store,p_date,round(p_total,2),coalesce(p_finance->>'purchaseSource','manual'),mode_name,company);
 end if;
 for item in select value from jsonb_array_elements(p_items) loop
  if jsonb_typeof(item)<>'object' or coalesce(length(btrim(item->>'productName')),0) not between 1 and 160 or (item->>'price')::numeric is null or (item->>'price')::numeric::text in ('NaN','Infinity','-Infinity') or (item->>'price')::numeric not between 0 and 1000000 or (item->>'quantity')::numeric is null or (item->>'quantity')::numeric::text in ('NaN','Infinity','-Infinity') or (item->>'quantity')::numeric<=0 or (item->>'quantity')::numeric>1000000 or coalesce(length(item->>'unit'),0) not between 1 and 30 then raise exception 'GROCERY_ITEM_INVALID';end if;
  product:=nullif(item->>'productId','')::uuid;
  if product is not null and not exists(select 1 from public.grocery_products where id=product and user_id=p_user) then raise exception 'GROCERY_PRODUCT_DENIED';end if;
  insert into public.grocery_purchase_items(purchase_id,product_id,product_name,category,price,quantity,unit,price_estimated)
   values(purchase_id,product,btrim(item->>'productName'),coalesce(nullif(item->>'category',''),'Outros'),(item->>'price')::numeric,(item->>'quantity')::numeric,item->>'unit',coalesce((item->>'priceEstimated')::boolean,false));
 end loop;
 if linked is null then
  insert into public.finances(user_id,type,amount,category,description,date,mode,company_id,source,registered_by,account_id,card_invoice_id)
   values(p_user,'expense',round(p_total,2),'Alimentação','Compra no '||store_name,p_date,mode_name,company,source_name,p_finance->>'registeredBy',account,invoice) returning id into linked;
  update public.grocery_purchases set finance_id=linked where id=purchase_id and user_id=p_user;
 else
  update public.finances set amount=round(p_total,2),date=p_date,description='Compra no '||store_name where id=linked and user_id=p_user;
  if not found then raise exception 'GROCERY_FINANCE_MISSING';end if;
 end if;
 if checked_ids is not null then delete from public.grocery_shopping_list_items l where l.user_id=p_user and l.id=any(checked_ids);end if;
 if p_purchase is null and op_key is not null then
  insert into public.grocery_purchase_operations(user_id,operation_key,signature,purchase_id) values(p_user,op_key,operation_signature,purchase_id);
 end if;
 perform set_config('zelo.grocery_write',previous_flag,true);
 return purchase_id;
end;$$;

create function public.delete_grocery_purchase(p_user uuid,p_purchase uuid) returns boolean
language plpgsql set search_path=pg_catalog as $$
declare linked uuid;
begin
 select finance_id into linked from public.grocery_purchases where id=p_purchase and user_id=p_user;
 if linked is not null then perform 1 from public.finances where id=linked and user_id=p_user for update;end if;
 select finance_id into linked from public.grocery_purchases where id=p_purchase and user_id=p_user for update;
 if not found then return false;end if;
 delete from public.grocery_purchases where id=p_purchase and user_id=p_user;
 if linked is not null then delete from public.finances where id=linked and user_id=p_user;end if;
 return true;
end;$$;
revoke all on function public.grocery_purchase_guard(),public.grocery_finance_guard(),public.save_grocery_purchase(uuid,uuid,uuid,date,jsonb,numeric,jsonb),public.delete_grocery_purchase(uuid,uuid) from public,anon,authenticated;
grant execute on function public.save_grocery_purchase(uuid,uuid,uuid,date,jsonb,numeric,jsonb),public.delete_grocery_purchase(uuid,uuid) to service_role;
commit;
