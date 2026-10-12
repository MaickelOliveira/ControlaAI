import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

// Isolated reproduction: a holder revokes a bank in Company A and gives a
// fresh consent for the same provider resource in Company B. No live calls.
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const user = '00000000-0000-4000-8000-000000000001';
const institution = '20000000-0000-4000-8000-000000000001';
const sql = file => readFile(new URL(file, import.meta.url), 'utf8');
const rpc = async (name, args) => (await db.query(
  `select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) value`, args,
)).rows[0].value;
const scope = async company => {
  await db.exec('set role service_role');
  await db.query("select set_config('request.headers',$1,false)", [JSON.stringify({ 'x-zelo-owner': user, 'x-zelo-company': company })]);
};
const consent = (id,mode='business',products=['ACCOUNT']) => rpc('zelo_of_save_consent', [user, mode, JSON.stringify({
  id, cliente_user_id: user, institution_id: institution, institution_name: 'Fixture Bank',
  status: 'AUTHORISED', products,
})]);
const runJob = async (connection, company, kind, reference, rows, family="accounts",mode="business") => {
  await scope(company);
  await rpc('zelo_of_enqueue', [user, mode, connection.id, JSON.stringify({ kind, family, external_resource_id: reference })]);
  await db.exec('reset role');
  await db.query('update open_finance.user_access set next_sync_claim_at=null where user_id=$1', [user]);
  await scope(company);
  const job = await rpc('zelo_of_claim', [user, mode]);
  assert.equal(job.company_id, mode==='personal'?null:company);
  return rpc('zelo_of_commit_page', [user, mode, job.id, job.lease_token, JSON.stringify(rows), null, '[]']);
};
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
    '20261011170000_open_finance_companies', '20261012000000_bank_identity', '20261012020000_finance_account_filter', '20261012030000_bank_workspace_reconnect',
  ]) await db.exec(await sql('../migrations/' + file + '.sql'));
  const companyA = (await db.query('select id from companies where user_id=$1 and is_default', [user])).rows[0].id;
  const companyB = (await db.query("insert into companies(user_id,name) values($1,'Second fixture company') returning id", [user])).rows[0].id;
  await scope(companyA);
  await rpc('zelo_of_enable_brazil', [user, 'business', 'BR', true]);
  const firstExternal = '10000000-0000-4000-8000-000000000001';
  const first = await consent(firstExternal);
  const resource = { external_id: 'shared-provider-account', resource_type: 'account', subtype: 'accounts', name: 'Fixture account', currency: 'BRL', available_amount: '123.45' };
  await runJob(first, companyA, 'catalog', firstExternal, { resources: [resource] });
  await runJob(first, companyA, 'transactions', resource.external_id, { movements: [{
    resource_external_id: resource.external_id, resource_type: 'account', external_id: 'old-movement',
    description: 'Historical fixture purchase', transaction_date: '2026-10-01', amount: '12.34',
    currency: 'BRL', direction: 'debit', classification: 'purchase',
  }] });
  await rpc('zelo_of_set_status', [user, 'business', first.id, 'revoking', null]);
  await rpc('zelo_of_set_status', [user, 'business', first.id, 'revoked', 'REVOKED']);
  await db.exec('reset role');
  const beforeResources = (await db.query('select * from open_finance.resources where company_id=$1 order by id', [companyA])).rows;
  const beforeMovements = (await db.query('select * from open_finance.movements where company_id=$1 order by id', [companyA])).rows;
  await scope(companyB);
  const secondExternal = '10000000-0000-4000-8000-000000000002';
  const second = await consent(secondExternal);
  let syncError;
  try { await runJob(second, companyB, 'catalog', secondExternal, { resources: [{ ...resource, available_amount: '456.78' }] }); }
  catch (error) { syncError = error; }
  await db.exec('reset role');
  assert.deepEqual((await db.query('select * from open_finance.resources where company_id=$1 order by id', [companyA])).rows, beforeResources, 'old resource IDs and financial history must remain byte-equivalent');
  assert.deepEqual((await db.query('select * from open_finance.movements where company_id=$1 order by id', [companyA])).rows, beforeMovements, 'old movement evidence must remain untouched');
  assert.equal(syncError, undefined, `new consent must import in the new company; actual: ${syncError?.message}`);
  await scope(companyB);
  const overview = await rpc('zelo_of_overview', [user, 'production', 'business']);
  assert.equal(overview.resources.length, 1);
  assert.notEqual(overview.resources[0].id, beforeResources[0].id);
  assert.equal(overview.resources[0].available_amount, '456.78000000');
  assert.equal((await rpc('zelo_of_report', [user, 'business', '2026-10-01', '2026-10-31', null])).movements.length, 0, 'new company must not inherit old movements');
  const newId=overview.resources[0].id;
  await db.exec('reset role');
  const event=await rpc('zelo_of_event_target',[resource.external_id,'accounts']);assert.equal(event.companyId,companyB);assert.equal(event.id,second.id);
  const oldTarget=await rpc('zelo_of_event_target',[firstExternal,'consents']);assert.equal(oldTarget.status,'revoked');assert.equal(oldTarget.companyId,companyA);
  await scope(companyA);await assert.rejects(rpc('zelo_of_enqueue',[user,'business',first.id,JSON.stringify({kind:'catalog',family:'accounts',external_resource_id:firstExternal})]),/OF_CONSENT_INACTIVE/);
  await scope(companyB);
  const renewedExternal='10000000-0000-4000-8000-000000000003';const renewed=await consent(renewedExternal);
  await runJob(renewed,companyB,'catalog',renewedExternal,{resources:[resource]});
  assert.equal((await rpc('zelo_of_overview',[user,'production','business'])).resources[0].id,newId,'renewal within the same workspace retains its identity');
  await db.exec('reset role');
  await db.query("update open_finance.connections set status='active',revoked_at=null where id=$1",[first.id]);
  await assert.rejects(rpc('zelo_of_event_target',[resource.external_id,'accounts']),/OF_TARGET_AMBIGUOUS/,'two active consents must never route arbitrarily');
  await db.query("update open_finance.connections set status='revoked',revoked_at=now() where id=$1",[first.id]);
  await scope(companyA);assert.equal((await rpc('zelo_of_overview',[user,'production','business'])).resources[0].id,beforeResources[0].id);
  await scope(companyB);
  const cardConsentExternal='10000000-0000-4000-8000-000000000004';const cardConsent=await consent(cardConsentExternal,'business',['CREDIT_CARD_ACCOUNT']);
  await runJob(cardConsent,companyB,'catalog',cardConsentExternal,{resources:[{external_id:'new-company-card',resource_type:'card',subtype:'credit-cards',name:'Fixture gold'}],limits:[{resource_external_id:'new-company-card',line_key:'view',currency:'BRL',available_amount:'80',total_amount:'100',used_amount:'20'}]},'credit-cards');
  await runJob(cardConsent,companyB,'bills','new-company-card',{bills:[{resource_external_id:'new-company-card',external_id:'bill',currency:'BRL',total_amount:'20',due_date:'2026-10-20',status:'unknown'}]},'credit-cards');
  assert.equal((await rpc('zelo_of_overview',[user,'production','business'])).bills.length,1);
  await scope(companyA);assert.equal((await rpc('zelo_of_overview',[user,'production','business'])).bills.length,0);
  await scope(companyB);
  const personalExternal='10000000-0000-4000-8000-000000000005';const personal=await consent(personalExternal,'personal');
  await runJob(personal,companyB,'catalog',personalExternal,{resources:[resource]},'accounts','personal');
  const personalId=(await rpc('zelo_of_overview',[user,'production','personal'])).resources[0].id;
  await runJob(personal,companyB,'catalog',personalExternal,{resources:[resource]},'accounts','personal');
  const personalOverview=await rpc('zelo_of_overview',[user,'production','personal']);assert.equal(personalOverview.resources.length,1);assert.equal(personalOverview.resources[0].id,personalId,'NULL personal scope still deduplicates');
  await db.exec('reset role');await assert.rejects(db.exec(await sql('../rollbacks/20261012030000_bank_workspace_reconnect.sql')),/OF_SCOPE_HISTORY_REQUIRES_FORWARD_FIX/);await db.exec('rollback');
  console.log('Revoked company history preserved; a fresh consent imports independently into a second company.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally { await db.close(); }
