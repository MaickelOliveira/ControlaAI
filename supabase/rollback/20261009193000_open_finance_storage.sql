-- Manual rollback only; not part of the migration pipeline.
-- Refuses to remove an unrecognized schema or any stored Open Finance data.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
-- Raise rather than silently inspect filtered rows when the operator lacks bypass.
set local row_security = off;
do $$ declare relation_name text; has_rows boolean; begin
  if (select obj_description(oid, 'pg_namespace') from pg_namespace where nspname = 'open_finance')
      is distinct from 'Zelo Open Finance storage v1 (20261009193000); private; disabled' then
    raise exception 'Rollback refused: unrecognized Open Finance schema';
  end if;
  if (select count(*) from pg_tables where schemaname = 'open_finance') <> 8 then
    raise exception 'Rollback refused: storage structure has changed';
  end if;
  for relation_name in select tablename from pg_tables where schemaname = 'open_finance' order by tablename loop
    execute format('lock table open_finance.%I in access exclusive mode', relation_name);
  end loop;
  for relation_name in select tablename from pg_tables where schemaname = 'open_finance' loop
    execute format('select exists(select 1 from open_finance.%I)', relation_name) into has_rows;
    if has_rows then
      raise exception 'Rollback refused: % contains data', relation_name;
    end if;
  end loop;
end $$;
drop table open_finance.movements;
drop table open_finance.card_limits;
drop table open_finance.credit_details;
drop table open_finance.bills;
drop table open_finance.sync_state;
drop table open_finance.resources;
drop table open_finance.connections;
drop table open_finance.user_access;
drop schema open_finance;
commit;
