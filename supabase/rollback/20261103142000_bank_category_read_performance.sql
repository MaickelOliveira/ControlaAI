-- Rollback preserves all stored categories and useful concurrent indexes.
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
declare definition text;replacement text:=$old$  select array_agg(distinct m.id) into direct_ids from open_finance.movements m
  where m.user_id=p_user and m.mode=p_mode and m.environment='production' and m.resource_id=chosen.resource_id and m.direction='debit'
   and (m.id=chosen.id or exists(select 1 from open_finance.card_schedules s where s.user_id=p_user and s.mode=p_mode and s.environment='production' and s.resource_id=chosen.resource_id and s.kind='installment' and chosen.external_id=any(s.observed_transactions) and m.external_id=any(s.observed_transactions)));$old$;
needle text:=$new$  select array_agg(distinct m.id) into direct_ids from open_finance.movements m
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

create or replace function open_finance.schedule_movement_category(p_user uuid,p_mode text,p_resource uuid,p_external text,p_explicit text) returns text
language sql stable set search_path=pg_catalog set row_security=on as $$
 select coalesce(p_explicit,(select min(s.user_category) from open_finance.card_schedules s
  where s.user_id=p_user and s.mode=p_mode and s.environment='production' and s.resource_id=p_resource and p_external=any(s.observed_transactions) and s.user_category is not null having count(distinct s.user_category)=1),
  (with family as materialized (
   select open_finance.category_purchase_movements(p_user,p_mode,target.id) as ids from open_finance.movements target
    where target.user_id=p_user and target.mode=p_mode and target.environment='production' and target.resource_id=p_resource and target.external_id=p_external
     and target.resource_type='card' and target.direction='debit' and target.installment_count between 2 and 1000
  ) select min(m.user_category) from family join open_finance.movements m on m.id=any(family.ids)
    where m.user_id=p_user and m.mode=p_mode and m.environment='production' and m.resource_id=p_resource and m.user_category is not null having count(distinct m.user_category)=1));
$$;
create or replace function open_finance.effective_schedule_category(p_user uuid,p_mode text,p_schedule uuid) returns text
language sql stable set search_path=pg_catalog set row_security=on as $$
 select coalesce(s.user_category,(select min(open_finance.schedule_movement_category(p_user,p_mode,m.resource_id,m.external_id,m.user_category)) from open_finance.movements m
  where m.user_id=p_user and m.mode=p_mode and m.environment='production' and m.resource_id=s.resource_id and m.external_id=any(s.observed_transactions)
  having count(distinct open_finance.schedule_movement_category(p_user,p_mode,m.resource_id,m.external_id,m.user_category))=1))
 from open_finance.card_schedules s where s.id=p_schedule and s.user_id=p_user and s.mode=p_mode and s.environment='production';
$$;

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
