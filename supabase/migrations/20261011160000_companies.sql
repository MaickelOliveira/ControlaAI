-- Additive workspaces. Existing business data keeps its IDs and first company.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
create table public.companies (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.users(id) on delete cascade,
 name text not null check(length(btrim(name)) between 1 and 100),
 document text check(document ~ '^[0-9]{14}$'),
 is_default boolean not null default false,
 custom_categories_expense jsonb not null default '[]',
 custom_categories_income jsonb not null default '[]',
 created_at timestamptz not null default now(),
 unique(id,user_id)
);
create unique index companies_default_idx on public.companies(user_id) where is_default;
create index companies_owner_idx on public.companies(user_id);
alter table public.companies enable row level security;
revoke all on public.companies from public,anon,authenticated;
grant select,insert,update,delete on public.companies to service_role;
insert into public.companies(user_id,name,is_default,custom_categories_expense,custom_categories_income)
 select id,left(coalesce(nullif(btrim(company),''),'Empresa principal'),100),true,
 coalesce(to_jsonb(custom_categories_expense),'[]'),coalesce(to_jsonb(custom_categories_income),'[]') from public.users;
create function public.zelo_company_for_user() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
begin
 insert into public.companies(user_id,name,is_default) values(new.id,left(coalesce(nullif(btrim(new.company),''),'Empresa principal'),100),true);
 return new;
end;$$;
revoke all on function public.zelo_company_for_user() from public,anon,authenticated;
create trigger zelo_company_new_user after insert on public.users for each row execute function public.zelo_company_for_user();

-- user_id on invoices makes their ownership explicit, including direct ID operations.
alter table public.card_invoices add column user_id uuid references public.users(id) on delete cascade;
update public.card_invoices i set user_id=a.user_id from public.accounts a where a.id=i.account_id;
alter table public.card_invoices alter column user_id set not null;
do $$declare t text;begin
 foreach t in array array['accounts','finances','tasks','reminders','goals','vehicles','recurring_transactions','employees','customers','appointments','meets','drive_folders','drive_files','card_invoices'] loop
  execute format('alter table public.%I add column company_id uuid, add constraint %I foreign key(company_id,user_id) references public.companies(id,user_id)',t,t||'_company_owner_fk');
  execute format('create index %I on public.%I(user_id,company_id)',t||'_company_scope_idx',t);
  if t=any(array['accounts','finances','tasks','reminders','goals','vehicles','recurring_transactions']) then
   execute format('update public.%I r set company_id=c.id from public.companies c where c.user_id=r.user_id and c.is_default and r.mode=''business''',t);
  elsif t=any(array['employees','customers','appointments','meets','drive_folders','drive_files']) then
   execute format('update public.%I r set company_id=c.id from public.companies c where c.user_id=r.user_id and c.is_default',t);
  end if;
 end loop;
 foreach t in array array['appointments','meets','drive_folders','drive_files'] loop
  execute format('alter table public.%I add column workspace_legacy boolean not null default true',t);
  execute format('update public.%I set workspace_legacy=true',t);
 end loop;
end;$$;
update public.card_invoices i set company_id=a.company_id from public.accounts a where a.id=i.account_id;
drop index public.accounts_user_mode_name_uidx;
drop index public.accounts_user_mode_default_uidx;
create unique index accounts_personal_name_uidx on public.accounts(user_id,mode,lower(name)) where company_id is null;
create unique index accounts_company_name_uidx on public.accounts(user_id,company_id,lower(name)) where company_id is not null;
create unique index accounts_personal_default_uidx on public.accounts(user_id,mode) where is_default and company_id is null;
create unique index accounts_company_default_uidx on public.accounts(user_id,company_id) where is_default and company_id is not null;

-- Legacy app deployments can still write to the default company during rollout.
create function public.zelo_public_company_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare payload jsonb:=to_jsonb(new);parent_company uuid;parent_owner uuid;parent_record_id uuid;link record;
 headers jsonb:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
 selected_company uuid:=nullif(headers->>'x-zelo-company','')::uuid;
 selected_owner uuid:=nullif(headers->>'x-zelo-owner','')::uuid;
begin
 if tg_op='UPDATE' and (new.id<>old.id or new.user_id is distinct from old.user_id or new.company_id is distinct from old.company_id) then raise exception 'COMPANY_REASSIGNMENT_DENIED';end if;
 if tg_table_name='card_invoices' then
  select user_id,company_id into parent_owner,parent_company from public.accounts where id=new.account_id;
  if not found then raise exception 'COMPANY_PARENT_NOT_FOUND';end if;
  if new.user_id is not null and new.user_id<>parent_owner then raise exception 'COMPANY_PARENT_MISMATCH';end if;
  new.user_id:=parent_owner;
  if new.company_id is not null and new.company_id is distinct from parent_company then raise exception 'COMPANY_PARENT_MISMATCH';end if;
  new.company_id:=parent_company;
 elsif tg_table_name=any(array['appointments','meets','drive_folders','drive_files']) and new.company_id is null and payload->>'workspace_legacy'='true' then
  select id into new.company_id from public.companies where user_id=new.user_id and is_default;
 elsif tg_table_name=any(array['employees','customers']) or payload->>'mode'='business' then
  if new.company_id is null then select id into new.company_id from public.companies where user_id=new.user_id and is_default;end if;
 elsif payload->>'mode'='personal' and new.company_id is not null then raise exception 'COMPANY_PERSONAL_MISMATCH';
 end if;
 if new.company_id is not null and not exists(select 1 from public.companies where id=new.company_id and user_id=new.user_id) then raise exception 'COMPANY_OWNER_MISMATCH';end if;
 for link in select * from (values('account_id','accounts'),('card_invoice_id','card_invoices'),('employee_id','employees'),('folder_id','drive_folders'),('parent_id','drive_folders')) x(field,table_name) loop
  parent_record_id:=nullif(payload->>link.field,'')::uuid;
  if parent_record_id is not null and tg_table_name<>link.table_name then
   execute format('select user_id,company_id from public.%I where id=$1',link.table_name) into parent_owner,parent_company using parent_record_id;
   -- Existing shared folders remain usable in personal mode during rollout.
   if tg_table_name='drive_files' and new.company_id is null and exists(select 1 from public.drive_folders f where f.id=parent_record_id and f.user_id=new.user_id and f.workspace_legacy) then new.company_id:=parent_company;new.workspace_legacy:=true;end if;
   if parent_owner is null or parent_owner<>new.user_id or parent_company is distinct from new.company_id then raise exception 'COMPANY_PARENT_MISMATCH';end if;
  elsif parent_record_id is not null and tg_table_name='drive_folders' then
   select user_id,company_id into parent_owner,parent_company from public.drive_folders where id=parent_record_id;
   if new.company_id is null and exists(select 1 from public.drive_folders f where f.id=parent_record_id and f.user_id=new.user_id and f.workspace_legacy) then new.company_id:=parent_company;new.workspace_legacy:=true;end if;
   if parent_owner is null or parent_owner<>new.user_id or parent_company is distinct from new.company_id then raise exception 'COMPANY_PARENT_MISMATCH';end if;
  end if;
 end loop;
 if selected_owner is not null and new.user_id<>selected_owner then raise exception 'COMPANY_OWNER_MISMATCH';end if;
 if selected_company is not null then
  if not exists(select 1 from public.companies where id=selected_company and user_id=new.user_id) then raise exception 'COMPANY_OWNER_MISMATCH';end if;
  if new.company_id is not null and new.company_id<>selected_company then
   if tg_table_name<>all(array['drive_folders','drive_files']) or coalesce(to_jsonb(new)->>'workspace_legacy','false')<>'true' or not exists(select 1 from public.companies where id=new.company_id and user_id=new.user_id and is_default) then raise exception 'COMPANY_SCOPE_MISMATCH';end if;
  end if;
  if new.company_id is not null and headers->>'x-zelo-business-access'='false' and tg_table_name<>all(array['appointments','meets','drive_folders','drive_files']) then raise exception 'COMPANY_ACCESS_DENIED';end if;
 end if;
 return new;
end;$$;
revoke all on function public.zelo_public_company_guard() from public,anon,authenticated;
do $$declare t text;begin
 foreach t in array array['accounts','finances','tasks','reminders','goals','vehicles','recurring_transactions','employees','customers','appointments','meets','drive_folders','drive_files','card_invoices'] loop
  execute format('create trigger zelo_company_guard before insert or update on public.%I for each row execute function public.zelo_public_company_guard()',t);
 end loop;
end;$$;
alter table public.wpp_phone_links add column active_company_id uuid;
alter table public.wpp_phone_links add column active_workspace_mode text check(active_workspace_mode in ('personal','business'));
alter table public.wpp_phone_links add constraint wpp_active_company_owner_fk foreign key(active_company_id,user_id) references public.companies(id,user_id);
commit;
