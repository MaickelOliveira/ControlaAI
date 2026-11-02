-- Expose bank-reported contract progress without changing data or persistent grants.
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
-- Add only contract progress to the existing scoped, server-only read.
-- The function's owner, grants, row-security settings and access gates remain intact.
do $$
declare definition text;needle text:='''payments'',coalesce(';replacement text;
begin
 definition:=pg_get_functiondef('public.zelo_of_credit_data(uuid,text,date,date)'::regprocedure);
 if position('''progress''' in definition)>0 then return;end if;
 if position(needle in definition)=0 or position('with scoped as (' in definition)=0 then raise exception 'OF_CREDIT_PROGRESS_BASE_MISMATCH';end if;
 replacement:='''progress'',coalesce((select jsonb_agg(jsonb_build_object(''resource_id'',resource_id,''paid_installments'',paid_installments,''remaining_installments'',remaining_installments,''due_date'',due_date)) from scoped),''[]''::jsonb), '||needle;
 execute replace(definition,needle,replacement);
end;$$;
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
