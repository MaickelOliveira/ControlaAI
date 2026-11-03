-- Apply as a new forward migration if needed. Existing user choices and financial facts are retained.
-- Private helpers remain installed because bank views depend on them.
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
create or replace function public.zelo_of_set_schedule_category(p_user uuid,p_mode text,p_schedule uuid,p_category text) returns boolean
language plpgsql security definer set search_path=pg_catalog set row_security=on as $$
begin
 perform open_finance.require_access(p_user,p_mode);
 if p_category is not null and (length(btrim(p_category)) not between 1 and 100 or p_category<>btrim(p_category)) then raise exception 'OF_CATEGORY_INVALID';end if;
 update open_finance.card_schedules set user_category=p_category
 where id=p_schedule and user_id=p_user and mode=p_mode and environment='production' and kind in ('recurring','installment');
 return found;
end;$$;
create or replace function open_finance.schedule_movement_category(p_user uuid,p_mode text,p_resource uuid,p_external text,p_explicit text) returns text
language sql stable set search_path=pg_catalog set row_security=on as $$
 select coalesce(p_explicit,(select min(s.user_category) from open_finance.card_schedules s
 where s.user_id=p_user and s.mode=p_mode and s.environment='production' and s.resource_id=p_resource
 and p_external=any(s.observed_transactions) and s.user_category is not null having count(distinct s.user_category)=1));
$$;
create or replace function public.zelo_of_set_movement_category(p_user uuid,p_mode text,p_movement uuid,p_category text) returns boolean
language plpgsql security definer set search_path=pg_catalog set row_security=on as $$
begin
  perform open_finance.require_access(p_user,p_mode);
  if p_category is not null and (length(btrim(p_category)) not between 1 and 100 or p_category<>btrim(p_category)) then raise exception 'OF_CATEGORY_INVALID';end if;
  update open_finance.movements set user_category=p_category
    where id=p_movement and user_id=p_user and environment='production' and mode=p_mode
      and open_finance.company_visible(user_id,mode,company_id);
  return found;
end;$$;
create or replace function open_finance.effective_schedule_category(p_user uuid,p_mode text,p_schedule uuid) returns text
language sql stable set search_path=pg_catalog set row_security=on as $$
 select s.user_category from open_finance.card_schedules s where s.id=p_schedule and s.user_id=p_user and s.mode=p_mode and s.environment='production';
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
