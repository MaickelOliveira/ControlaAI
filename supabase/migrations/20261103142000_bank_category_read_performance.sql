-- Bound category resolution while preserving purchase-wide saved choices.
-- Existing function owners, ACLs, RLS and all financial data remain unchanged.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
create temporary table zelo_progress_migration_privileges on commit drop as
 select pg_has_role(current_user,'zelo_of_workspace','SET') and pg_has_role(current_user,'zelo_of_workspace','USAGE') as effective,
 (select jsonb_build_object('admin',admin_option,'inherit',inherit_option,'set',set_option) from pg_auth_members where roleid='zelo_of_workspace'::regrole and member=(select oid from pg_roles where rolname=current_user) and grantor=(select oid from pg_roles where rolname=current_user)) as own_grant,
 has_schema_privilege('zelo_of_workspace','public','CREATE') as public_create,
 has_schema_privilege('zelo_of_workspace','open_finance','CREATE') as private_create;
do $$declare original jsonb;begin
 if not exists(select 1 from pg_roles where rolname='zelo_of_workspace' and not rolcanlogin and not rolsuper and not rolbypassrls) then raise exception 'OF_WORKSPACE_ROLE_UNSAFE';end if;
 if not(select effective from zelo_progress_migration_privileges) then
  select own_grant into original from zelo_progress_migration_privileges;
  execute format('grant zelo_of_workspace to %I with admin %s,inherit true,set true granted by %I',current_user,case when (original->>'admin')::boolean then 'true' else 'false' end,current_user);
 end if;
end;$$;
do $$begin
 if not(select public_create from zelo_progress_migration_privileges) then grant create on schema public to zelo_of_workspace;end if;
 if not(select private_create from zelo_progress_migration_privileges) then grant create on schema open_finance to zelo_of_workspace;end if;
end;$$;
-- Find the positively linked bank transaction IDs once, rather than evaluating
-- the same schedule search for every movement on a card.
do $migration$
declare definition text;needle text:=$old$  select array_agg(distinct m.id) into direct_ids from open_finance.movements m
  where m.user_id=p_user and m.mode=p_mode and m.environment='production' and m.resource_id=chosen.resource_id and m.direction='debit'
   and (m.id=chosen.id or exists(select 1 from open_finance.card_schedules s where s.user_id=p_user and s.mode=p_mode and s.environment='production' and s.resource_id=chosen.resource_id and s.kind='installment' and chosen.external_id=any(s.observed_transactions) and m.external_id=any(s.observed_transactions)));$old$;
replacement text:=$new$  select array_agg(distinct m.id) into direct_ids from open_finance.movements m
  where m.user_id=p_user and m.mode=p_mode and m.environment='production' and m.resource_id=chosen.resource_id and m.direction='debit'
   and m.external_id=any(array[chosen.external_id]||array(
    select distinct unnest(s.observed_transactions) from open_finance.card_schedules s
    where s.user_id=p_user and s.mode=p_mode and s.environment='production' and s.resource_id=chosen.resource_id
     and s.kind='installment' and chosen.external_id=any(s.observed_transactions)));$new$;
begin
 definition:=pg_get_functiondef('open_finance.category_purchase_movements(uuid,text,uuid)'::regprocedure);
 if position(needle in definition)=0 then raise exception 'OF_CATEGORY_READ_BASE_MISMATCH';end if;
 execute replace(definition,needle,replacement);
end $migration$;

-- Most bank movements have no saved sibling category. Do not resolve an entire
-- purchase for each of those rows. First check the small, indexed override set.
create or replace function open_finance.schedule_movement_category(p_user uuid,p_mode text,p_resource uuid,p_external text,p_explicit text) returns text
language plpgsql stable set search_path=pg_catalog set row_security=on as $$
declare chosen open_finance.movements%rowtype;result text;choices integer;ids uuid[];
begin
 if p_explicit is not null then return p_explicit;end if;
 select min(s.user_category),count(distinct s.user_category) into result,choices
 from open_finance.card_schedules s where s.user_id=p_user and s.mode=p_mode and s.environment='production'
  and s.resource_id=p_resource and s.user_category is not null and p_external=any(s.observed_transactions);
 if choices=1 then return result;end if;
 select * into chosen from open_finance.movements m where m.user_id=p_user and m.mode=p_mode and m.environment='production'
  and m.resource_id=p_resource and m.external_id=p_external and m.resource_type='card' and m.direction='debit'
  and m.installment_count between 2 and 1000;
 if not found then return null;end if;
 if not exists(select 1 from open_finance.movements m
  where m.user_id=p_user and m.mode=p_mode and m.environment='production' and m.resource_id=p_resource and m.user_category is not null
   and (m.external_id=any(array(select distinct unnest(s.observed_transactions) from open_finance.card_schedules s
     where s.user_id=p_user and s.mode=p_mode and s.environment='production' and s.resource_id=p_resource
      and s.kind='installment' and p_external=any(s.observed_transactions)))
    or m.resource_type='card' and m.direction='debit' and m.transaction_date=chosen.transaction_date and m.currency=chosen.currency
     and m.installment_count=chosen.installment_count and m.installment_number between 1 and chosen.installment_count
     and abs(m.amount-chosen.amount)<=least(.20,least(m.amount,chosen.amount)*.02)
     and length(open_finance.category_purchase_name(chosen.description))>=3
     and (open_finance.category_purchase_name(m.description)=open_finance.category_purchase_name(chosen.description)
      or length(least(open_finance.category_purchase_name(m.description),open_finance.category_purchase_name(chosen.description)))>=9
       and (starts_with(open_finance.category_purchase_name(m.description),open_finance.category_purchase_name(chosen.description))
        or starts_with(open_finance.category_purchase_name(chosen.description),open_finance.category_purchase_name(m.description)))))) then return null;end if;
 ids:=open_finance.category_purchase_movements(p_user,p_mode,chosen.id);
 select min(m.user_category),count(distinct m.user_category) into result,choices from open_finance.movements m
  where m.user_id=p_user and m.mode=p_mode and m.environment='production' and m.resource_id=p_resource
   and m.id=any(ids) and m.user_category is not null;
 return case when choices=1 then result end;
end $$;

-- Evaluate each linked movement only once even though both aggregate checks
-- need its effective category. Explicit schedule categories still return at once.
create or replace function open_finance.effective_schedule_category(p_user uuid,p_mode text,p_schedule uuid) returns text
language plpgsql stable set search_path=pg_catalog set row_security=on as $$
declare chosen open_finance.card_schedules%rowtype;result text;choices integer;
begin
 select * into chosen from open_finance.card_schedules s where s.id=p_schedule and s.user_id=p_user and s.mode=p_mode and s.environment='production';
 if not found then return null;end if;
 if chosen.user_category is not null then return chosen.user_category;end if;
 with values_once as materialized (
  select open_finance.schedule_movement_category(p_user,p_mode,m.resource_id,m.external_id,m.user_category) as category
  from open_finance.movements m where m.user_id=p_user and m.mode=p_mode and m.environment='production'
   and m.resource_id=chosen.resource_id and m.external_id=any(chosen.observed_transactions)
 ) select min(category),count(distinct category) into result,choices from values_once;
 return case when choices=1 then result end;
end $$;
do $$declare original jsonb;begin
 if not(select public_create from zelo_progress_migration_privileges) then revoke create on schema public from zelo_of_workspace;end if;
 if not(select private_create from zelo_progress_migration_privileges) then revoke create on schema open_finance from zelo_of_workspace;end if;
 if not(select effective from zelo_progress_migration_privileges) then
  if (select own_grant from zelo_progress_migration_privileges) is null then execute format('revoke zelo_of_workspace from %I granted by %I',current_user,current_user);
  else
   select own_grant into original from zelo_progress_migration_privileges;
   execute format('grant zelo_of_workspace to %I with admin %s,inherit %s,set %s granted by %I',current_user,case when (original->>'admin')::boolean then 'true' else 'false' end,case when (original->>'inherit')::boolean then 'true' else 'false' end,case when (original->>'set')::boolean then 'true' else 'false' end,current_user);
  end if;
 end if;
end;$$;
notify pgrst,'reload schema';
commit;
