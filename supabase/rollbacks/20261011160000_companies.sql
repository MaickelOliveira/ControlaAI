-- Disable MULTI_COMPANY_ENABLED before running. Never discard another company's history.
begin;
set local lock_timeout='5s';
do $$begin
 if exists(select 1 from public.companies where not is_default) then raise exception 'COMPANY_HISTORY_PRESENT: rollback refused; keep additive schema and disable the feature instead';end if;
 if exists(select 1 from information_schema.columns where table_schema='open_finance' and table_name='connections' and column_name='company_id') then raise exception 'ROLL_BACK_BANK_COMPANY_MIGRATION_FIRST';end if;
end;$$;
drop trigger zelo_company_new_user on public.users;
drop function public.zelo_company_for_user();
do $$declare t text;begin
 foreach t in array array['accounts','finances','tasks','reminders','goals','vehicles','recurring_transactions','employees','customers','appointments','meets','drive_folders','drive_files','card_invoices'] loop
  execute format('drop trigger zelo_company_guard on public.%I',t);
  execute format('alter table public.%I drop column company_id',t);
 end loop;
 foreach t in array array['appointments','meets','drive_folders','drive_files'] loop execute format('alter table public.%I drop column workspace_legacy',t);end loop;
end;$$;
drop function public.zelo_public_company_guard();
alter table public.card_invoices drop column user_id;
drop index if exists public.accounts_personal_name_uidx;
drop index if exists public.accounts_personal_default_uidx;
create unique index accounts_user_mode_name_uidx on public.accounts(user_id,mode,lower(name));
create unique index accounts_user_mode_default_uidx on public.accounts(user_id,mode) where is_default;
alter table public.wpp_phone_links drop column active_company_id,drop column active_workspace_mode;
drop table public.companies;
commit;
