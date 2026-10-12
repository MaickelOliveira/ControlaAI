import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';

// Isolated contract tests, no live WhatsApp, customers, or provider calls.
// node supabase/tests/run-whatsapp-quiet-activity.mjs <pglite-module>
const {PGlite}=await import(pathToFileURL(process.argv[2]).href);
const db=new PGlite();
const owner='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
const phone='5511999990001',alias='11999990001',unrelated='5511999990002';
const variants=[phone,alias];
const sql=file=>readFile(new URL(file,import.meta.url),'utf8');
const rpc=async(name,args)=>(await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) value`,args)).rows[0].value;
const root=()=>db.exec('reset role');
const service=()=>db.exec('set role service_role');
const claim=(token=randomUUID(),key=phone,keys=variants)=>rpc('zelo_wpp_question_claim',[key,keys,token]);
const ready=(token,key=phone,keys=variants)=>rpc('zelo_wpp_question_ready',[key,keys,token]);
const begin=(token,kind='inbound',key=phone)=>rpc('zelo_wpp_activity_begin',[key,token,kind,variants]);
const finish=(token,key=phone)=>rpc('zelo_wpp_activity_finish',[key,token,variants]);
const nowMs=async()=>Number((await db.query('select floor(extract(epoch from clock_timestamp())*1000)::text value')).rows[0].value);
const conversation=async(key=phone,patch={})=>{
 await root();const now=await nowMs();
 const data={messages:[{role:'user',channel:'waba',content:'Fixture hello',ts:now-300000}],lastActivity:now-300000,aiPaused:false,...(typeof patch==='function'?patch(now):patch)};
 await db.query('insert into conversations(phone,data) values($1,$2::jsonb) on conflict(phone) do update set data=excluded.data',[key,JSON.stringify(data)]);await service();
};
const reset=async()=>{await root();await db.exec('truncate open_finance.whatsapp_activity;truncate open_finance.whatsapp_recent_activity;truncate conversations;truncate pending_actions');await conversation();};
const pending=async(key,expiresAt)=>{await root();await db.query('insert into pending_actions(phone,data) values($1,$2::jsonb) on conflict(phone) do update set data=excluded.data',[key,JSON.stringify({type:'fixture',userId:owner,expiresAt})]);await service();};
const denied=async(operation,label)=>{let value;try{value=await operation();}catch{return;}assert.equal(value,false,label);};
try{
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);');
 await db.exec((await sql('../schema.sql')).replace('create extension if not exists "pgcrypto";',''));
 for(const [id,phone,email] of [[owner,'5511999990001','one@example.test'],[other,'5511999990002','two@example.test']])await db.query("insert into users(id,phone,name,email,password_hash,plan,status,trial_ends_at) values($1,$2,'Fixture',$3,'fake','business','active',now()+interval '7 days')",[id,phone,email]);
 for(const file of ['20261009193000_open_finance_storage','20261009213000_open_finance_server_access','20261009220000_open_finance_consents','20261009230000_open_finance_sync_queue','20261009234000_open_finance_report','20261010185000_open_finance_categories','20261010230000_open_finance_public','20261011030000_open_finance_notifications','20261011090000_open_finance_connection_management','20261011093000_open_finance_subscription_retirement','20261011110000_open_finance_archive_history','20261011160000_companies','20261011170000_open_finance_companies','20261011210000_nfse_preparation','20261012000000_bank_identity','20261012010000_company_archive','20261012020000_finance_account_filter','20261012030000_bank_workspace_reconnect','20261012040000_preserve_bank_movement_facts','20261012050000_credit_funded_payments'])await db.exec(await sql('../migrations/'+file+'.sql'));
 try{await db.exec(await sql('../migrations/20261012060000_whatsapp_quiet_activity.sql'));}catch(error){if(error.code!=='ENOENT')throw error;console.log('RED setup: migration absent; checking new RPCs against schema through 50000.');}
 // This first call proves a real missing-function RED after all old migrations load.
 await conversation();const first=randomUUID();assert.equal(await begin(first),true,'inbound activity starts');
 console.log('PASS: activity RPC exists');
 const second=randomUUID();assert.equal(await begin(second),true,'parallel inbound work is not dropped');
 assert.equal(await claim(),false,'any active inbound prevents a question');
 assert.equal(await finish(randomUUID()),false,'an unknown nonce cannot finish another handler');
 assert.equal(await finish(first),true);assert.equal(await claim(),false,'finishing one handler leaves the other active');
 assert.equal(await finish(second),true);
 await root();assert.equal((await db.query('select count(*)::int n from open_finance.whatsapp_activity')).rows[0].n,0,'finish removes only its own activity rows');await service();
 console.log('PASS: overlapping handlers and nonce-specific finish');

 await reset();const notice=randomUUID();assert.equal(await begin(notice,'notice'),true);assert.equal(await claim(),false,'an outgoing notice is active work');assert.equal(await finish(notice),true);
 await reset();const q=randomUUID();assert.equal(await claim(q),true);assert.equal(await ready(q),true);
 assert.equal(await claim(randomUUID()),false,'a second question cannot reserve the same conversation');
 const again=await claim(q);assert.equal(typeof again,'boolean');
 await root();assert.equal((await db.query('select count(*)::int n from open_finance.whatsapp_activity where token=$1 and kind=$2',[q,'question'])).rows[0].n,1,'repeating a claim never adds a second reservation');await service();
 assert.equal(await ready(randomUUID()),false,'ready requires the exact reservation nonce');
 assert.equal(await finish(randomUUID()),false);assert.equal(await ready(q),true,'stale finish does not clear a newer reservation');
 assert.equal(await finish(q),true);assert.equal(await ready(q),false);
 console.log('PASS: notice gate, exclusive question and reservation ownership');

 for(const label of ['new inbound','new notice']){
  await reset();const question=randomUUID();assert.equal(await claim(question),true);const activity=randomUUID();
  assert.equal(await begin(activity,label==='new inbound'?'inbound':'notice'),true);
  assert.equal(await ready(question),false,`${label} invalidates readiness while active`);
  await finish(activity);assert.equal(await ready(question),false,`${label} after the reservation cannot restore old readiness`);
 }
 for(const role of ['user','assistant']){
  await reset();const question=randomUUID();assert.equal(await claim(question),true);
  await conversation(phone,now=>({messages:[{role:'user',channel:'waba',ts:now-300000},{role,channel:'waba',ts:now}],lastActivity:now}));
  assert.equal(await ready(question),false,`new ${role} activity after claim blocks send`);
 }
 await reset();const held=randomUUID();assert.equal(await claim(held),true);await pending(alias,new Date(Date.now()+300000).toISOString());assert.equal(await ready(held),false,'another pending prompt after reservation blocks send');
 // An inbound may use a legacy phone spelling, while the question used the canonical key.
 await reset();const aliasQuestion=randomUUID();assert.equal(await claim(aliasQuestion),true);const aliasInbound=randomUUID();
 assert.equal(await begin(aliasInbound,'inbound',alias),true);assert.equal(await ready(aliasQuestion),false,'active alias inbound blocks the canonical question');
 assert.equal(await finish(aliasInbound,alias),true);assert.equal(await ready(aliasQuestion),false,'finishing alias inbound must not resurrect the previous canonical question');
 await root();await db.exec("update open_finance.whatsapp_recent_activity set last_activity=clock_timestamp()-interval '5 minutes'");await service();
 assert.equal(await ready(aliasQuestion),false,'an invalidated claim stays invalid even after the quiet interval returns');
 console.log('PASS: a changed conversation cannot send using an old ready reservation');

 const closedCases=[
  ['no inbound',()=>({messages:[]})],
  ['unknown channel',now=>({messages:[{role:'user',ts:now-300000}]})],
  ['Evolution is not verified WABA',now=>({messages:[{role:'user',channel:'evolution',ts:now-300000}]})],
  ['assistant cannot open window',now=>({messages:[{role:'assistant',channel:'waba',ts:now-300000}]})],
  ['expired window',now=>({messages:[{role:'user',channel:'waba',ts:now-86401000}],lastActivity:now-300000})],
  ['future inbound timestamp',now=>({messages:[{role:'user',channel:'waba',ts:now+60000}]})],
  ['recent incoming',now=>({messages:[{role:'user',channel:'waba',ts:now-60000}],lastActivity:now-60000})],
  ['recent outgoing',now=>({messages:[{role:'user',channel:'waba',ts:now-300000},{role:'assistant',ts:now-60000}],lastActivity:now-300000})],
  ['last activity still recent',now=>({lastActivity:now-60000})],
  ['AI paused',()=>({aiPaused:true})],
 ];
 for(const [label,patch] of closedCases){await reset();await conversation(phone,patch);assert.equal(await claim(),false,label);}
 await reset();await conversation(phone,now=>({messages:[{role:'user',channel:'waba',ts:now-86300000}],lastActivity:now-121000}));assert.equal(await claim(),true,'quiet conversation just inside 24h is eligible');
 console.log('PASS: verified inbound window, incoming/outgoing quiet time and AI pause');

 for(const key of variants){
  await reset();await pending(key,new Date(Date.now()+300000).toISOString());assert.equal(await claim(),false,'active pending on any phone variant blocks');
  await pending(key,new Date(Date.now()-1000).toISOString());assert.equal(await claim(),true,'expired pending does not block');
 }
 await reset();await conversation(alias,now=>({lastActivity:now-60000}));assert.equal(await claim(),false,'recent alias activity blocks the canonical phone');
 await reset();await conversation(alias,{aiPaused:true});assert.equal(await claim(),false,'paused alias cannot be bypassed by another key');
 await reset();await root();await db.query('delete from conversations where phone=$1',[phone]);await service();await conversation(alias);assert.equal(await claim(),true,'valid inbound history may live under a known alias');
 await reset();await conversation(unrelated,now=>({lastActivity:now,aiPaused:true}));assert.equal(await claim(),true,'another phone does not block this conversation');
 // The same full variant set has one lock/reservation key independent of input order or spelling.
 await reset();const aliasClaim=randomUUID();assert.equal(await claim(aliasClaim),true);
 assert.equal(await claim(randomUUID(),alias,[...variants].reverse()),false,'alias cannot obtain a second reservation');
 assert.equal(await ready(aliasClaim,alias,[...variants].reverse()),true,'the reservation resolves consistently through either alias');
 assert.equal(await finish(aliasClaim,alias),true,'alias resolves the same owned reservation');
 assert.equal(await claim(randomUUID(),alias,[...variants].reverse()),true,'a finished question releases the shared alias key');
 console.log('PASS: all supplied phone variants participate without involving unrelated phones');

 await reset();const expired=randomUUID();await begin(expired);await root();
 const inboundLease=(await db.query("select extract(epoch from(expires_at-clock_timestamp()))::float8 seconds from open_finance.whatsapp_activity where token=$1",[expired])).rows[0];assert.ok(inboundLease.seconds>590&&inboundLease.seconds<=600,'inbound lease is ten minutes');
 await db.query("update open_finance.whatsapp_activity set expires_at=clock_timestamp()-interval '1 second' where token=$1",[expired]);await db.exec("update open_finance.whatsapp_recent_activity set last_activity=now()-interval '5 minutes'");await service();const replacement=randomUUID();assert.equal(await claim(replacement),true,'expired work lease no longer blocks');
 await root();const questionLease=(await db.query("select extract(epoch from(expires_at-clock_timestamp()))::float8 seconds from open_finance.whatsapp_activity where token=$1",[replacement])).rows[0];assert.ok(questionLease.seconds>20&&questionLease.seconds<=30,'question reservation is thirty seconds');await service();
 await finish(expired);assert.equal(await ready(replacement),true,'old activity token cannot finish a replacement reservation');
 await root();await db.query("update open_finance.whatsapp_activity set expires_at=clock_timestamp()-interval '1 second' where token=$1",[replacement]);await service();assert.equal(await ready(replacement),false);assert.equal(await claim(),true,'expired question can be replaced');
 console.log('PASS: bounded leases, expiration and stale-owner protection');
 // Download/transcription failure can finish before addMessage runs. Persisted
 // recent activity must keep the old conversation from appearing quiet again.
 for(const kind of ['inbound','notice']){
  await reset();const activity=randomUUID();assert.equal(await begin(activity,kind,alias),true);
  await root();await db.exec("update open_finance.whatsapp_recent_activity set last_activity=clock_timestamp()-interval '5 minutes'");await service();
  assert.equal(await finish(activity,alias),true);assert.equal(await claim(),false,`${kind} finish starts a fresh quiet interval without a history write`);
  await root();assert.equal((await db.query('select count(*)::int n from open_finance.whatsapp_activity')).rows[0].n,0);
  await db.exec("update open_finance.whatsapp_recent_activity set last_activity=clock_timestamp()-interval '119 seconds'");await service();assert.equal(await claim(),false,'119 seconds is not quiet enough');
  await root();await db.exec("update open_finance.whatsapp_recent_activity set last_activity=clock_timestamp()-interval '121 seconds'");await service();assert.equal(await claim(),true,'a quiet recent-activity stamp eventually permits a new claim');
 }
 console.log('PASS: persisted recent activity protects failed media and outgoing completion');


 await reset();
 for(const bad of ['', '1234567','1'.repeat(21),'+5511999990001','55 11999990001',null]){
  await denied(()=>begin(randomUUID(),'inbound',bad),'invalid phone denied');
  await denied(()=>claim(randomUUID(),bad,[phone]),'invalid claim phone denied');
 }
 for(const keys of [[],Array(9).fill(phone),['abc'],[null],null])await denied(()=>claim(randomUUID(),phone,keys),'invalid variants denied');
 await denied(()=>begin(randomUUID(),'question'),'begin cannot bypass question eligibility');await denied(()=>begin(null),'null lease nonce denied');
 await denied(()=>claim(null),'null question nonce denied');
 console.log('PASS: phone, variants, nonce and activity-kind validation');

 await root();const table=(await db.query("select relrowsecurity rls,relforcerowsecurity forced from pg_class where oid='open_finance.whatsapp_activity'::regclass")).rows[0];assert.equal(table.rls,true);assert.equal(table.forced,true);
 const recentTable=(await db.query("select relrowsecurity rls,relforcerowsecurity forced from pg_class where oid='open_finance.whatsapp_recent_activity'::regclass")).rows[0];assert.equal(recentTable.rls,true);assert.equal(recentTable.forced,true);
 const primary=(await db.query("select array_agg(a.attname order by c.position) columns from pg_constraint k cross join lateral unnest(k.conkey) with ordinality c(attnum,position) join pg_attribute a on a.attrelid=k.conrelid and a.attnum=c.attnum where k.conrelid='open_finance.whatsapp_activity'::regclass and k.contype='p'")).rows[0].columns;assert.deepEqual(primary,['phone_key','token']);
 for(const signature of ['public.zelo_wpp_activity_begin(text,uuid,text,text[])','public.zelo_wpp_activity_finish(text,uuid,text[])','public.zelo_wpp_question_claim(text,text[],uuid)','public.zelo_wpp_question_ready(text,text[],uuid)']){
  const fn=(await db.query('select prosecdef,proconfig from pg_proc where oid=$1::regprocedure',[signature])).rows[0];assert.equal(fn.prosecdef,true);assert.ok(fn.proconfig.some(value=>value.startsWith('search_path=')),'definer has explicit search path');
  for(const role of ['anon','authenticated'])assert.equal((await db.query("select has_function_privilege($1,$2,'EXECUTE') allowed",[role,signature])).rows[0].allowed,false);
  assert.equal((await db.query("select has_function_privilege('service_role',$1,'EXECUTE') allowed",[signature])).rows[0].allowed,true);
 }
 for(const role of ['anon','authenticated','service_role'])for(const tableName of ['open_finance.whatsapp_activity','open_finance.whatsapp_recent_activity']){
  for(const privilege of ['SELECT','INSERT','UPDATE','DELETE'])assert.equal((await db.query('select has_table_privilege($1,$2,$3) allowed',[role,tableName,privilege])).rows[0].allowed,false);
  await db.exec('set role '+role);await assert.rejects(db.query('select * from '+tableName),/permission denied/);await root();
 }
 for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(begin(randomUUID()),/permission denied/);await root();}
 console.log('PASS: private forced-RLS table, composite key and server-only RPCs');
}catch(error){console.error(error.stack??error.message);process.exitCode=1;}finally{await db.close();}
