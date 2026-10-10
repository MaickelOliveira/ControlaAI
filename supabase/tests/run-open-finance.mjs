// Uses an explicitly supplied PGlite module in memory. No server connection.
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

if (!process.argv[2]) throw new Error('Pass the installed PGlite module path; see supabase/OPEN_FINANCE.md');
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const sql = (relativePath) => readFile(new URL(relativePath, import.meta.url), 'utf8');
try {
  await db.exec(await sql('./open_finance_fixtures.sql'));
  const migration = await sql('../migrations/20261009193000_open_finance_storage.sql');
  await db.exec(migration);
  const results = await db.exec(await sql('./open_finance_storage.sql'));
  console.log(results.at(-1).rows[0].result);
  await assert.rejects(db.exec(migration), /open_finance already exists/);
  await db.exec('rollback');

  const rollback = await sql('../rollback/20261009193000_open_finance_storage.sql');
  await db.exec(`insert into open_finance.user_access(user_id, country_code, country_verified_at)
    values ('00000000-0000-4000-8000-000000000001', 'BR', now())`);
  await assert.rejects(db.exec(rollback), /contains data/);
  await db.exec('rollback');
  const retained = await db.query('select count(*)::int as count from open_finance.user_access');
  assert.equal(retained.rows[0].count, 1);
  // A table owner subject to FORCE RLS must not mistake invisible rows for empty.
  await db.exec(`create role storage_owner;
    grant usage, create on schema open_finance to storage_owner;
    do $$ declare table_name text; begin
      for table_name in select tablename from pg_tables where schemaname = 'open_finance' loop
        execute format('alter table open_finance.%I owner to storage_owner', table_name);
      end loop;
    end $$;
    alter schema open_finance owner to storage_owner;
    set role storage_owner;`);
  await assert.rejects(db.exec(rollback), /row-level security/);
  await db.exec('rollback; reset role');
  assert.equal((await db.query('select count(*)::int as count from open_finance.user_access')).rows[0].count, 1);
  await db.exec('delete from open_finance.user_access');
  await db.exec(rollback);
  const preserved = await db.query(`select
    to_regnamespace('open_finance') is null as removed,
    (select sum(amount) from public.finances)::int as existing_amount`);
  assert.equal(preserved.rows[0].removed, true);
  assert.equal(preserved.rows[0].existing_amount, 42);
  console.log('Repeat-apply guard and empty-only rollback passed; existing finances preserved');
} finally {
  await db.close();
}
