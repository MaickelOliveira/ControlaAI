-- Read-only proof after preparation. No customer data is retrieved.
with row_counts(table_name, rows_stored) as (
  select 'user_access', count(*) from open_finance.user_access union all
  select 'connections', count(*) from open_finance.connections union all
  select 'resources', count(*) from open_finance.resources union all
  select 'card_limits', count(*) from open_finance.card_limits union all
  select 'bills', count(*) from open_finance.bills union all
  select 'movements', count(*) from open_finance.movements union all
  select 'credit_details', count(*) from open_finance.credit_details union all
  select 'sync_state', count(*) from open_finance.sync_state
)
select r.table_name as estrutura, r.rows_stored as registros,
  c.relrowsecurity and c.relforcerowsecurity as rls_ativa,
  not exists(select 1 from pg_policies p where p.schemaname = 'open_finance' and p.tablename = r.table_name) as sem_politicas,
  not exists(
    select 1 from pg_roles roles cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) privileges(privilege)
    where roles.rolname in ('anon', 'authenticated', 'service_role')
      and (has_schema_privilege(roles.rolname, 'open_finance', 'USAGE')
        or has_table_privilege(roles.rolname, format('open_finance.%I', r.table_name), privileges.privilege))
  ) as acesso_app_bloqueado,
  obj_description(n.oid, 'pg_namespace') = 'Zelo Open Finance storage v1 (20261009193000); private; disabled' as versao_correta,
  to_regclass('public.finances') is not null and to_regclass('public.accounts') is not null as zelo_atual_preservado
from row_counts r
join pg_namespace n on n.nspname = 'open_finance'
join pg_class c on c.relnamespace = n.oid and c.relname = r.table_name
order by r.table_name;
