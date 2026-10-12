import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

// Regression: a partial response must not erase known facts for the same
// provider transaction. Uses an isolated in-memory PostgreSQL with fake data.
// Run: node supabase/tests/run-open-finance-movement-refresh.mjs <pglite-module>
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const user = '00000000-0000-4000-8000-000000000001';
const externalConsent = '10000000-0000-4000-8000-000000000001';
const sql = file => readFile(new URL(file, import.meta.url), 'utf8');
const rpc = async (name, args) => (await db.query(
  `select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) value`, args,
)).rows[0].value;
const failures = [];
const functionMetadata = async () => (await db.query("select pg_get_userbyid(proowner) owner,proacl::text acl,proconfig,prosecdef,provolatile from pg_proc where oid='public.zelo_of_commit_page(uuid,text,uuid,uuid,jsonb,text,jsonb)'::regprocedure")).rows[0];
try {
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);');
  await db.exec((await sql('../schema.sql')).replace('create extension if not exists "pgcrypto";', ''));
  await db.query("insert into users(id,phone,name,email,password_hash,plan,status,trial_ends_at) values($1,'5511999990000','Fixture','fixture@example.test','fake','business','active',now()+interval '7 days')", [user]);
  for (const file of [
    '20261009193000_open_finance_storage', '20261009213000_open_finance_server_access',
    '20261009220000_open_finance_consents', '20261009230000_open_finance_sync_queue',
    '20261009234000_open_finance_report', '20261010185000_open_finance_categories',
    '20261010230000_open_finance_public', '20261011030000_open_finance_notifications',
    '20261011090000_open_finance_connection_management', '20261011093000_open_finance_subscription_retirement',
    '20261011110000_open_finance_archive_history', '20261011160000_companies',
    '20261011170000_open_finance_companies', '20261011210000_nfse_preparation', '20261012000000_bank_identity',
    '20261012010000_company_archive', '20261012020000_finance_account_filter',
    '20261012030000_bank_workspace_reconnect',
    '20261012040000_preserve_bank_movement_facts',
  ]) {
    const before = file === '20261012040000_preserve_bank_movement_facts' ? await functionMetadata() : null;
    await db.exec(await sql('../migrations/' + file + '.sql'));
    if (before) {
      assert.deepEqual(await functionMetadata(), before, 'patch preserves owner, grants, RLS and function attributes');
      assert.equal(before.owner, 'zelo_of_workspace');
      assert.ok(before.proconfig.includes('row_security=on'));
      assert.equal(before.prosecdef, true);
      for (const role of ['anon', 'authenticated']) {
        assert.equal((await db.query("select has_function_privilege($1,'public.zelo_of_commit_page(uuid,text,uuid,uuid,jsonb,text,jsonb)','EXECUTE') allowed", [role])).rows[0].allowed, false);
      }
      assert.equal((await db.query("select has_function_privilege('service_role','public.zelo_of_commit_page(uuid,text,uuid,uuid,jsonb,text,jsonb)','EXECUTE') allowed")).rows[0].allowed, true);
      console.log('PASS: owner, grants and row security preserved');
    }
  }
  const company = (await db.query('select id from companies where user_id=$1 and is_default', [user])).rows[0].id;
  await db.exec('set role service_role');
  await db.query("select set_config('request.headers',$1,false)", [JSON.stringify({ 'x-zelo-owner': user, 'x-zelo-company': company })]);
  await rpc('zelo_of_enable_brazil', [user, 'business', 'BR', true]);
  const connection = await rpc('zelo_of_save_consent', [user, 'business', JSON.stringify({
    id: externalConsent, cliente_user_id: user,
    institution_id: '20000000-0000-4000-8000-000000000001',
    institution_name: 'Fixture Bank', status: 'AUTHORISED', products: ['CREDIT_CARD_ACCOUNT'],
  })]);
  const run = async (kind, rows) => {
    await rpc('zelo_of_enqueue', [user, 'business', connection.id, JSON.stringify({
      kind, family: 'credit-cards', external_resource_id: kind === 'catalog' ? externalConsent : 'fixture-card',
      window: kind === 'bill-transactions' ? { billId: 'fixture-bill' } : {},
    })]);
    await db.exec('reset role');
    await db.query('update open_finance.user_access set next_sync_claim_at=null where user_id=$1', [user]);
    await db.exec('set role service_role');
    const job = await rpc('zelo_of_claim', [user, 'business']);
    assert.ok(job, 'fixture job must be claimable');
    await rpc('zelo_of_commit_page', [user, 'business', job.id, job.lease_token, JSON.stringify(rows), null, '[]']);
  };
  await run('catalog', { resources: [{ external_id: 'fixture-card', resource_type: 'card', subtype: 'credit-cards', name: 'Fixture card' }] });
  await run('bills', { bills: [{ external_id: 'fixture-bill', resource_external_id: 'fixture-card', due_date: '2026-11-01', total_amount: '100', currency: 'BRL', status: 'unknown' }] });
  const report = () => rpc('zelo_of_report', [user, 'business', '2026-10-01', '2026-10-31', null]);
  const storedMovement = async externalId => {
    await db.exec('reset role');
    const row = (await db.query('select id,description,transaction_date::text,amount::text,currency,original_amount::text,original_currency,direction,classification,user_category,source_updated_at::text from open_finance.movements where external_id=$1', [externalId])).rows[0];
    await db.exec('set role service_role');
    return row;
  };
  const fromSource = (kind, row) => kind === 'bill-transactions' ? { ...row, bill_external_id: 'fixture-bill' } : row;
  for (const [label, firstKind, nextKind, patch] of [
    ['same stream sparse refresh', 'transactions', 'transactions', { transaction_date: null, amount: null, currency: null }],
    ['transactions then sparse bill detail', 'transactions', 'bill-transactions', { transaction_date: null, amount: null, currency: null }],
    ['bill detail then sparse transactions', 'bill-transactions', 'transactions', { transaction_date: null, amount: null, currency: null }],
    ['known date but missing money', 'transactions', 'transactions', { amount: null, currency: null }],
  ]) {
    const original = {
      resource_external_id: 'fixture-card', resource_type: 'card', external_id: `fixture-${failures.length}-${label}`,
      description: 'Fictitious purchase', transaction_date: '2026-10-11',
      amount: '12.34', currency: 'BRL', direction: 'debit', classification: 'purchase', source_updated_at: null,
    };
    await run(firstKind, { movements: [fromSource(firstKind, original)] });
    await db.exec('reset role');
    const initialId = (await db.query('select id from open_finance.movements where external_id=$1', [original.external_id])).rows[0].id;
    await db.exec('set role service_role');
    const before = (await report()).movements.find(row => row.id === initialId && row.amount === '12.34000000' && row.date === '2026-10-11');
    assert.ok(before, 'complete initial transaction must appear before refresh');
    await run(nextKind, { movements: [fromSource(nextKind, { ...original, ...patch })] });
    await db.exec('reset role');
    const stored = (await db.query('select id,transaction_date::text,amount::text,currency from open_finance.movements where external_id=$1', [original.external_id])).rows[0];
    await db.exec('set role service_role');
    const after = await report();
    try {
      assert.equal(stored.transaction_date, original.transaction_date, 'known transaction date must survive a partial refresh');
      assert.equal(stored.amount, '12.34000000', 'known amount must survive a partial refresh');
      assert.equal(stored.currency, original.currency, 'known currency must survive a partial refresh');
      assert.ok(after.movements.some(row => row.id === stored.id), 'transaction must remain in the dated ledger');
      console.log(`PASS: ${label}`);
    } catch (error) {
      failures.push(label);
      console.error(`FAIL: ${label}: ${error.message}; stored=${JSON.stringify(stored)}; visible=${after.movements.some(row => row.id === stored.id)}; missing_dates=${after.missing_dates}`);
    }
  }
  const rich = {
    resource_external_id: 'fixture-card', resource_type: 'card', external_id: 'fixture-rich-facts',
    description: 'Known fictitious merchant', description_present: true, transaction_date: '2026-10-11',
    amount: '12.34', currency: 'BRL', original_amount: '2.00', original_currency: 'USD',
    direction: 'debit', classification: 'purchase', source_updated_at: '2026-10-11T10:00:00Z',
  };
  await run('transactions', { movements: [rich] });
  const richId = (await storedMovement(rich.external_id)).id;
  await rpc('zelo_of_set_movement_category', [user, 'business', richId, 'Custom fixture category']);
  await run('bill-transactions', { movements: [fromSource('bill-transactions', {
    ...rich, description: 'COMPRA', description_present: false, direction: 'unknown', classification: 'unknown',
    amount: null, currency: 'EUR', original_amount: null, original_currency: null,
    source_updated_at: '2026-10-11T11:00:00Z',
  })] });
  const preserved = await storedMovement(rich.external_id);
  assert.equal(preserved.description, rich.description, 'generic fallback cannot replace the merchant name');
  assert.equal(preserved.direction, 'debit');
  assert.equal(preserved.classification, 'purchase');
  assert.equal(preserved.amount, '12.34000000');
  assert.equal(preserved.currency, 'BRL', 'a currency-only update must not relabel the old amount');
  assert.equal(preserved.original_amount, '2.00000000');
  assert.equal(preserved.original_currency, 'USD');
  assert.equal(preserved.user_category, 'Custom fixture category');
  console.log('PASS: sparse name, classification, direction, monetary pairs and user category');

  // Invalid half-pairs are rejected atomically, rather than borrowing the old
  // counterpart. The normalizer also rejects these malformed provider pairs.
  for (const patch of [
    { amount: '999', currency: null },
    { original_amount: '999', original_currency: null },
    { original_amount: null, original_currency: 'EUR' },
  ]) {
    const before = await storedMovement(rich.external_id);
    await db.exec('begin');
    try {
      await assert.rejects(run('transactions', { movements: [{ ...rich, ...patch, source_updated_at: '2026-10-11T12:00:00Z' }] }), /check constraint/);
    } finally { await db.exec('rollback'); }
    assert.deepEqual(await storedMovement(rich.external_id), before, 'rejected half-pair must not mutate stored facts');
  }
  console.log('PASS: invalid half-pairs fail without combining unrelated values and currencies');

  const correction = { ...rich, description: 'Corrected fictitious merchant', transaction_date: '2026-10-12', amount: '0', currency: 'EUR', original_amount: '0', original_currency: 'GBP', direction: 'credit', classification: 'refund', source_updated_at: '2026-10-12T10:00:00Z' };
  await run('transactions', { movements: [correction] });
  const corrected = await storedMovement(rich.external_id);
  assert.equal(corrected.id, richId);
  assert.equal(corrected.description, correction.description);
  assert.equal(corrected.transaction_date, correction.transaction_date);
  assert.equal(corrected.amount, '0.00000000');
  assert.equal(corrected.currency, 'EUR');
  assert.equal(corrected.original_amount, '0.00000000');
  assert.equal(corrected.original_currency, 'GBP');
  assert.equal(corrected.direction, 'credit');
  assert.equal(corrected.classification, 'refund');
  assert.equal(corrected.user_category, 'Custom fixture category');
  await run('transactions', { movements: [rich] });
  assert.deepEqual(await storedMovement(rich.external_id), corrected, 'older source timestamp cannot overwrite a complete newer correction');
  console.log('PASS: complete newer correction and explicit zero accepted; older facts rejected');

  await db.exec('reset role');
  const otherCompany = (await db.query("insert into companies(user_id,name) values($1,'Other fixture company') returning id", [user])).rows[0].id;
  await db.exec('set role service_role');
  const headers = (ownerId, companyId) => db.query("select set_config('request.headers',$1,false)", [JSON.stringify({ 'x-zelo-owner': ownerId, 'x-zelo-company': companyId })]);
  await headers(user, otherCompany);
  assert.equal((await report()).movements.length, 0, 'other workspace cannot read the movements');
  await headers(user, company);
  await rpc('zelo_of_enqueue', [user, 'business', connection.id, JSON.stringify({ kind: 'transactions', family: 'credit-cards', external_resource_id: 'fixture-card', window: {} })]);
  await db.exec('reset role');
  await db.query('update open_finance.user_access set next_sync_claim_at=null where user_id=$1', [user]);
  await db.exec('set role service_role');
  const protectedJob = await rpc('zelo_of_claim', [user, 'business']);
  const commitProtected = mode => rpc('zelo_of_commit_page', [user, mode, protectedJob.id, protectedJob.lease_token, JSON.stringify({ movements: [{ ...correction, amount: '999', source_updated_at: '2026-10-13T10:00:00Z' }] }), null, '[]']);
  await headers(user, otherCompany);
  await assert.rejects(commitProtected('business'), /OF_JOB_NOT_FOUND|OF_ACCESS_DENIED|OF_COMPANY/);
  await headers('00000000-0000-4000-8000-000000000099', company);
  await assert.rejects(commitProtected('business'), /OF_ACCESS_DENIED|OF_COMPANY/);
  await headers(user, company);
  await assert.rejects(commitProtected('personal'), /OF_JOB_NOT_FOUND|OF_ACCESS_DENIED/);
  assert.deepEqual(await storedMovement(rich.external_id), corrected, 'wrong company, holder and mode cannot modify the facts');
  await rpc('zelo_of_commit_page', [user, 'business', protectedJob.id, protectedJob.lease_token, '{"movements":[]}', null, '[]']);
  console.log('PASS: company, holder and mode isolation on reads and commit');
  assert.equal(failures.length, 0, `Partial refresh regressions: ${failures.join(', ')}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await db.close();
}
