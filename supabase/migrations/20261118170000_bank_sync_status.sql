-- Separate stopped/failed imports from active work without changing bank facts or report access.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
create temporary table zelo_sync_migration_privileges on commit drop as
 select pg_has_role(current_user,'zelo_of_workspace','SET') and pg_has_role(current_user,'zelo_of_workspace','USAGE') as effective,
 (select jsonb_build_object('admin',admin_option,'inherit',inherit_option,'set',set_option) from pg_auth_members where roleid='zelo_of_workspace'::regrole and member=(select oid from pg_roles where rolname=current_user) and grantor=(select oid from pg_roles where rolname=current_user)) as own_grant,
 has_schema_privilege('zelo_of_workspace','public','CREATE') as public_create,
 has_schema_privilege('zelo_of_workspace','open_finance','CREATE') as private_create;
do $$declare original jsonb;begin
 if not exists(select 1 from pg_roles where rolname='zelo_of_workspace' and not rolcanlogin and not rolsuper and not rolbypassrls) then raise exception 'OF_WORKSPACE_ROLE_UNSAFE';end if;
 if not(select effective from zelo_sync_migration_privileges) then
  select own_grant into original from zelo_sync_migration_privileges;
  execute format('grant zelo_of_workspace to %I with admin %s,inherit true,set true granted by %I',current_user,case when (original->>'admin')::boolean then 'true' else 'false' end,current_user);
 end if;
end;$$;
do $$begin
 if not(select public_create from zelo_sync_migration_privileges) then grant create on schema public to zelo_of_workspace;end if;
 if not(select private_create from zelo_sync_migration_privileges) then grant create on schema open_finance to zelo_of_workspace;end if;
end;$$;
-- A stopped import is not an in-progress import. Preserve report access and facts.
do $migration$declare definition text;updated text;begin
 select pg_get_functiondef('open_finance.report_page(uuid,text,date,date,uuid,integer)'::regprocedure) into definition;
 if position('current_sync_jobs as materialized' in definition)>0 then return;end if;
 if position($old$  'sync_pending',exists(select 1 from open_finance.sync_jobs j where j.user_id=p_user and j.environment='production' and j.mode=p_mode and (j.status in ('pending','running') or (j.status='failed' and not exists(select 1 from open_finance.sync_jobs newer where newer.connection_id=j.connection_id and newer.kind=j.kind and newer.family=j.family and newer.external_resource_id=j.external_resource_id and newer.filter_window=j.filter_window and newer.status='complete' and newer.updated_at>j.updated_at)))),$old$ in definition)=0 or position(' with links as (' in definition)=0 then raise exception 'OF_SYNC_REPORT_DEFINITION_UNEXPECTED';end if;
 updated=replace(definition,' with links as (',$new$ with current_sync_jobs as materialized (
  select j.* from open_finance.sync_jobs j
  join open_finance.connections c on c.id=j.connection_id and c.user_id=j.user_id and c.environment=j.environment and c.mode=j.mode and c.company_id is not distinct from j.company_id
  where j.user_id=p_user and j.environment='production' and j.mode=p_mode and j.status in ('pending','running','failed')
   and c.status='active' and c.archived_at is null and c.revoked_at is null and (c.consent_expires_at is null or c.consent_expires_at>now())
   and not exists(select 1 from open_finance.sync_jobs newer where newer.connection_id=j.connection_id and newer.kind=j.kind and newer.family=j.family and newer.external_resource_id=j.external_resource_id and newer.filter_window=j.filter_window and newer.status='complete' and newer.updated_at>j.updated_at)
 ), links as ($new$);
 updated=replace(updated,$old$  'sync_pending',exists(select 1 from open_finance.sync_jobs j where j.user_id=p_user and j.environment='production' and j.mode=p_mode and (j.status in ('pending','running') or (j.status='failed' and not exists(select 1 from open_finance.sync_jobs newer where newer.connection_id=j.connection_id and newer.kind=j.kind and newer.family=j.family and newer.external_resource_id=j.external_resource_id and newer.filter_window=j.filter_window and newer.status='complete' and newer.updated_at>j.updated_at)))),$old$,$new$  'sync_pending',exists(select 1 from current_sync_jobs),
  'sync_status',case when exists(select 1 from current_sync_jobs where status='failed' or (status='pending' and error_code is not null) or (status='running' and coalesce(lease_until,'-infinity'::timestamptz)<=now())) then 'failed' when exists(select 1 from current_sync_jobs) then 'updating' else 'idle' end,$new$);
 updated=replace(updated,$old$  'last_successful_sync_at',(select max(last_successful_sync_at)from open_finance.connections where user_id=p_user and environment='production' and mode=p_mode)$old$,$new$  'last_successful_sync_at',(select max(last_successful_sync_at)from open_finance.connections where user_id=p_user and environment='production' and mode=p_mode and archived_at is null and revoked_at is null and status='active')$new$);
 execute updated;
end;$migration$;
do $$declare original jsonb;begin
 if not(select public_create from zelo_sync_migration_privileges) then revoke create on schema public from zelo_of_workspace;end if;
 if not(select private_create from zelo_sync_migration_privileges) then revoke create on schema open_finance from zelo_of_workspace;end if;
 if not(select effective from zelo_sync_migration_privileges) then
  if (select own_grant from zelo_sync_migration_privileges) is null then execute format('revoke zelo_of_workspace from %I granted by %I',current_user,current_user);
  else
   select own_grant into original from zelo_sync_migration_privileges;
   execute format('grant zelo_of_workspace to %I with admin %s,inherit %s,set %s granted by %I',current_user,case when (original->>'admin')::boolean then 'true' else 'false' end,case when (original->>'inherit')::boolean then 'true' else 'false' end,case when (original->>'set')::boolean then 'true' else 'false' end,current_user);
  end if;
 end if;
end;$$;
commit;
