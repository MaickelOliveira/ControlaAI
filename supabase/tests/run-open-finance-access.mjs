import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
if (!process.argv[2]) throw new Error('Pass the PGlite module path');
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const sql = relative => readFile(new URL(relative, import.meta.url), 'utf8');
try {
  await db.exec(await sql('./open_finance_fixtures.sql'));
  await db.exec(await sql('../migrations/20261009193000_open_finance_storage.sql'));
  await db.exec(await sql('../migrations/20261009213000_open_finance_server_access.sql'));
  const owner = '00000000-0000-4000-8000-000000000001';
  const other = '00000000-0000-4000-8000-000000000002';
  await db.exec(`insert into open_finance.user_access(user_id,country_code,country_verified_at,enabled) values ('${owner}','BR',now(),true),('${other}','BR',now(),false)`);
  for (const role of ['anon','authenticated']) {
    await db.exec(`set role ${role}`);
    await assert.rejects(db.query('select public.zelo_of_access($1)', [owner]), /permission denied/);
    await assert.rejects(db.query("select public.zelo_of_overview($1,'production','personal')", [owner]), /permission denied/);
    await db.exec('reset role');
  }
  await db.exec('set role service_role');
  assert.equal((await db.query('select public.zelo_of_access($1) as result', [owner])).rows[0].result.enabled, true);
  assert.equal((await db.query('select public.zelo_of_access($1) as result', [other])).rows[0].result.enabled, false);
  assert.deepEqual((await db.query("select public.zelo_of_overview($1,'production','personal') as result", [owner])).rows[0].result.connections, []);
  await assert.rejects(db.query("select public.zelo_of_overview($1,'production','personal')", [other]), /OF_ACCESS_DENIED/);
  await assert.rejects(db.query("select public.zelo_of_overview($1,'production','invalid')", [owner]), /OF_SCOPE_INVALID/);
  await assert.rejects(db.query('select * from open_finance.resources'), /permission denied/);
  console.log('Server RPC access passed: browser roles denied, eligibility enforced, private tables inaccessible');
} finally { await db.close(); }
