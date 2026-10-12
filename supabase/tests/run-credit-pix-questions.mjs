import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';

// Private SQL queue contract; fictitious data only, no provider/WhatsApp calls.
// node supabase/tests/run-credit-pix-questions.mjs <pglite-module>
const {PGlite}=await import(pathToFileURL(process.argv[2]).href);
const db=new PGlite();
const owner='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
const phone='5511999990001',foreignPhone='5511999990002';
const bank='20000000-0000-4000-8000-000000000001',otherBank='20000000-0000-4000-8000-000000000002';
const sql=file=>readFile(new URL(file,import.meta.url),'utf8');
const rpc=async(name,args=[])=>(await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) value`,args)).rows[0].value;
const root=()=>db.exec('reset role');
const scope=async(user,company)=>{await db.exec('set role service_role');await db.query("select set_config('request.headers',$1,false)",[JSON.stringify({'x-zelo-owner':user,'x-zelo-company':company})]);};
let company,otherCompany,foreignCompany,day,sequence=0;
const owned=()=>scope(owner,company);
const prepare=(user=owner,mode='business')=>rpc('zelo_of_prepare_credit_pix_questions',[user,mode]);
const get=(id,user=owner,mode='business')=>rpc('zelo_of_get_credit_pix_question',[user,mode,id]);
const claim=(id,p=phone,user=owner,mode='business')=>rpc('zelo_of_claim_credit_pix_question',[user,mode,id,p]);
const arm=(id,token)=>rpc('zelo_of_arm_credit_pix_question',[owner,'business',id,token]);
const finish=(id,token,status)=>rpc('zelo_of_finish_credit_pix_question',[owner,'business',id,token,status]);
const answer=(id,confirmed,p=phone,user=owner,mode='business')=>rpc('zelo_of_answer_credit_pix_question',[user,mode,id,p,confirmed]);
const row=async(id)=>{await root();const out=(await db.query('select * from open_finance.credit_pix_questions where id=$1',[id])).rows[0];await owned();return out;};
const questions=async()=>{await root();const out=(await db.query('select * from open_finance.credit_pix_questions order by id')).rows;await owned();return out;};
const linkCount=async()=>{await root();const n=(await db.query('select count(*)::int n from open_finance.credit_pix_links')).rows[0].n;await owned();return n;};
const raw=async()=>{await root();const out=(await db.query('select * from open_finance.movements order by id')).rows;await owned();return out;};
const denied=async(operation)=>{try{return await operation();}catch{return null;}};
const linkPhone=async(user,workspace,p=phone,mode='business',relation='Titular')=>{
 await root();await db.query("insert into wpp_phone_links(phone,user_id,name,relation,access,active_company_id,active_workspace_mode) values($1,$2,'Fixture Holder',$3,'both',$4,$5) on conflict(phone) do update set user_id=excluded.user_id,relation=excluded.relation,access=excluded.access,active_company_id=excluded.active_company_id,active_workspace_mode=excluded.active_workspace_mode",[p,user,relation,workspace,mode]);await scope(user,workspace);
};
const reset=async()=>{
 await root();await db.exec('truncate open_finance.credit_pix_questions,open_finance.credit_pix_links,open_finance.connections cascade');
 await db.exec('truncate pending_actions;truncate open_finance.whatsapp_activity;truncate open_finance.whatsapp_recent_activity');
 await db.query("update users set status='active' where id=any($1::uuid[])",[[owner,other]]);
 await linkPhone(owner,company);await linkPhone(other,foreignCompany,foreignPhone);await owned();
};
const makePair=async({user=owner,workspace=company,mode='business',description,paymentBank=bank}={})=>{
 await scope(user,workspace);await rpc('zelo_of_enable_brazil',[user,mode,'BR',true]);
 const n=++sequence,name=description??`Fixture Recipient ${n}`;
 const connection=async(institution)=>rpc('zelo_of_save_consent',[user,mode,JSON.stringify({id:randomUUID(),cliente_user_id:user,institution_id:institution,institution_name:'Fixture Bank',status:'AUTHORISED',products:['ACCOUNT','CREDIT_CARD_ACCOUNT']})]);
 const creditConnection=await connection(bank),paymentConnection=paymentBank===bank?creditConnection:await connection(paymentBank);
 await root();const result={user,workspace,mode,name};
 for(const [role,type,source,amount,c] of [['credit','card','OPERACOES_CREDITO_CONTRATADAS_CARTAO','850.16',creditConnection],['payment','account','PIX','821.48',paymentConnection]]){
  const resource=(await db.query("insert into open_finance.resources(connection_id,user_id,environment,mode,resource_type,external_id,name,subtype) values($1,$2,'production',$3,$4,$5,'Fixture product',$6) returning id",[c.id,user,mode,type,`q-resource-${n}-${role}`,type==='card'?'credit-cards':'accounts'])).rows[0].id;
  result[role]=(await db.query("insert into open_finance.movements(resource_id,user_id,environment,mode,resource_type,external_id,description,transaction_date,amount,currency,direction,classification,source_type) values($1,$2,'production',$3,$4,$5,$6,current_date,$7,'BRL','debit','unknown',$8) returning id",[resource,user,mode,type,`q-movement-${n}-${role}`,name,amount,source])).rows[0].id;
  result[role+'Resource']=resource;
 }
 await scope(user,workspace);return result;
};
const prepared=async()=>{const pair=await makePair();assert.equal(await prepare(),1);const q=(await questions())[0];assert.ok(q?.id);return {pair,q};};
const asked=async(q)=>{const token=await claim(q.id);assert.match(token,/^[a-f0-9-]{36}$/i);assert.equal(await arm(q.id,token),true);assert.equal(await finish(q.id,token,'asked'),true);return token;};
const total=async()=>{const report=await rpc('zelo_of_report',[owner,'business',day,day,null]);return report.totals.filter(x=>x.currency==='BRL').reduce((s,x)=>s+Math.round(Number(x.amount)*100),0);};
try{
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);');
 await db.exec((await sql('../schema.sql')).replace('create extension if not exists "pgcrypto";',''));
 for(const [id,phone,email] of [[owner,'5511999990001','one@example.test'],[other,'5511999990002','two@example.test']])await db.query("insert into users(id,phone,name,email,password_hash,plan,status,trial_ends_at) values($1,$2,'Fixture',$3,'fake','business','active',now()+interval '7 days')",[id,phone,email]);
 for(const file of ['20261009193000_open_finance_storage','20261009213000_open_finance_server_access','20261009220000_open_finance_consents','20261009230000_open_finance_sync_queue','20261009234000_open_finance_report','20261010185000_open_finance_categories','20261010230000_open_finance_public','20261011030000_open_finance_notifications','20261011090000_open_finance_connection_management','20261011093000_open_finance_subscription_retirement','20261011110000_open_finance_archive_history','20261011160000_companies','20261011170000_open_finance_companies','20261011210000_nfse_preparation','20261012000000_bank_identity','20261012010000_company_archive','20261012020000_finance_account_filter','20261012030000_bank_workspace_reconnect','20261012040000_preserve_bank_movement_facts','20261012050000_credit_funded_payments','20261012060000_whatsapp_quiet_activity'])await db.exec(await sql('../migrations/'+file+'.sql'));
 if(process.argv.includes('--before-queue'))console.log('RED setup: explicitly testing the pre-queue schema through 60000.');
 else try{await db.exec(await sql('../migrations/20261012070000_credit_pix_questions.sql'));}catch(error){if(error.code!=='ENOENT')throw error;console.log('RED setup: migration absent; checking queue RPCs against schema through 60000.');}
 if(!process.argv.includes('--before-queue')){
  try{await db.exec(await sql('../migrations/20261012071000_credit_pix_question_completion.sql'));}catch(error){if(error.code!=='ENOENT')throw error;console.log('RED maintenance setup: 71000 absent; checking completion against the existing queue.');}
 }
 company=(await db.query('select id from companies where user_id=$1 and is_default',[owner])).rows[0].id;
 otherCompany=(await db.query("insert into companies(user_id,name) values($1,'Second fixture company') returning id",[owner])).rows[0].id;
 foreignCompany=(await db.query('select id from companies where user_id=$1 and is_default',[other])).rows[0].id;
 day=(await db.query('select current_date::text as fixture_day')).rows[0].fixture_day;
 await linkPhone(owner,company);await linkPhone(other,foreignCompany,foreignPhone);await owned();
 const originalPair=await makePair();const originalFacts=await raw();
 assert.equal(await prepare(),1,'one conservative candidate is queued');
 console.log('PASS: prepare RPC exists and queues the eligible recent pair');
 const initial=(await questions())[0];assert.equal(initial.credit_movement,originalPair.credit);assert.equal(initial.payment_movement,originalPair.payment);assert.equal(initial.status,'pending');
 assert.equal(new Date(initial.credit_date).toISOString().slice(0,10),day);assert.equal(new Date(initial.payment_date).toISOString().slice(0,10),day);assert.equal(Number(initial.gross_amount),850.16);assert.equal(Number(initial.payment_amount),821.48);assert.equal(Number(initial.charges_amount),28.68);
 assert.equal(await prepare(),0,'prepare is idempotent');assert.equal((await questions()).length,1);assert.equal(await linkCount(),0);assert.deepEqual(await raw(),originalFacts,'preparation never alters bank facts');assert.equal(await total(),167164);
 const detail=await get(initial.id);assert.equal(detail.id,initial.id);
 const targets=await rpc('zelo_of_credit_pix_targets');assert.ok(Array.isArray(targets));assert.equal(targets.length,1);assert.equal(targets[0].id,initial.id);assert.equal(targets[0].phone,phone);
 for(const target of targets)for(const key of Object.keys(target))assert.ok(!/amount|description|name|currency|date/i.test(key),'global dispatcher exposes only scope, identity and recipient');
 console.log('PASS: prepare is idempotent, private and financially inert');

 await reset();const ambiguous=await makePair();await root();
 // More than a report page of harmless rows, followed by a second valid candidate.
 for(let i=0;i<60;i++)await db.query("insert into open_finance.movements(resource_id,user_id,environment,mode,resource_type,external_id,description,transaction_date,amount,currency,direction,classification,source_type) values($1,$2,'production','business','account',$3,'Unrelated recipient',current_date,1,'BRL','debit','unknown','PIX')",[ambiguous.paymentResource,owner,'unrelated-'+i]);
 await db.query("insert into open_finance.movements(resource_id,user_id,environment,mode,resource_type,external_id,description,transaction_date,amount,currency,direction,classification,source_type) values($1,$2,'production','business','account','second-candidate',$3,current_date,821.48,'BRL','debit','unknown','PIX')",[ambiguous.paymentResource,owner,ambiguous.name]);await owned();assert.equal(await prepare(),0,'all candidate payments count, including beyond the first report page');assert.equal((await questions()).length,0);
 await reset();await makePair({paymentBank:otherBank});assert.equal(await prepare(),0,'matching names at a different institution are not a candidate');
 await reset();const domestic=await makePair({description:'Scope Recipient'});await root();await db.query("update open_finance.movements set description='Unrelated' where id=$1",[domestic.payment]);await makePair({workspace:otherCompany,description:'Scope Recipient'});await owned();assert.equal(await prepare(),0,'payment in another company cannot complete this pair');
 console.log('PASS: ambiguity, report pagination, bank identity and company isolation');

 for(const [role,column,value] of [['credit','transaction_date','1900-01-01'],['credit','currency','USD'],['payment','currency','USD'],['credit','source_type','COMPRA'],['payment','source_type','TED'],['credit','direction','credit'],['payment','direction','credit'],['credit','classification','bill_payment'],['payment','classification','transfer'],['payment','classification','investment'],['credit','amount','850.161'],['payment','amount','0'],['payment','amount','851'],['credit','transaction_date',null]]){
  await reset();const pair=await makePair();await root();await db.query(`update open_finance.movements set ${column}=$1 where id=$2`,[value,pair[role]]);await owned();assert.equal(await prepare(),0,`ineligible ${role}.${column} cannot enqueue`);
 }
 await reset();const distant=await makePair();await root();await db.query("update open_finance.movements set transaction_date=current_date-3 where id=$1",[distant.payment]);await owned();assert.equal(await prepare(),0,'payment outside two days does not match');
 console.log('PASS: unknown, excluded, old, wrong-currency and non-cent facts stay unqueued');
 // A holder may answer in Finanças instead of clicking the WhatsApp button.
 // Housekeeping only closes the question; it must not perform reconciliation.
 await reset();const platform=await prepared();await asked(platform.q);
 await rpc('zelo_of_confirm_credit_pix',[owner,'business',platform.pair.credit,platform.pair.payment,'850.16','821.48','28.68',true,day,day]);
 const platformFacts=await raw();await root();const platformLinks=(await db.query('select * from open_finance.credit_pix_links order by id')).rows;await owned();
 await rpc('zelo_of_credit_pix_targets');assert.equal((await row(platform.q.id)).status,'confirmed','platform confirmation completes the outstanding WhatsApp question');
 assert.deepEqual(await raw(),platformFacts,'completion housekeeping leaves bank facts intact');await root();assert.deepEqual((await db.query('select * from open_finance.credit_pix_links order by id')).rows,platformLinks,'completion housekeeping does not insert, undo or modify financial links');await owned();
 console.log('PASS: a platform-confirmed pair closes its asked question without financial writes');

 await reset();const unanswered=await prepared();await asked(unanswered.q);
 await root();await db.query("update open_finance.credit_pix_questions set attempted_at=now()-interval '8 days' where id=$1",[unanswered.q.id]);await owned();
 const nextOwn=await makePair();assert.equal(await prepare(),1);const nextForeign=await makePair({user:other,workspace:foreignCompany});assert.equal(await prepare(other),1);await owned();
 const laterQuestions=await questions(),ownId=laterQuestions.find(item=>item.credit_movement===nextOwn.credit).id,foreignId=laterQuestions.find(item=>item.credit_movement===nextForeign.credit).id;
 const unansweredFacts=await raw();assert.equal(await linkCount(),0);const afterExpiry=await rpc('zelo_of_credit_pix_targets');
 assert.equal((await row(unanswered.q.id)).status,'stale','asked questions expire after seven unanswered days');
 assert.ok(afterExpiry.some(item=>item.id===ownId),'the old unanswered question no longer blocks its holder');assert.ok(afterExpiry.some(item=>item.id===foreignId),'another eligible holder remains dispatchable');
 assert.equal(await linkCount(),0);assert.deepEqual(await raw(),unansweredFacts,'expiry changes only question metadata');
 await root();await db.query("update open_finance.credit_pix_questions set created_at=now()-interval '8 days' where id=$1",[ownId]);await owned();await rpc('zelo_of_credit_pix_targets');assert.equal((await row(ownId)).status,'pending','waiting for an open window does not expire a question never sent');
 console.log('PASS: unanswered asked questions expire without expiring unsent pending questions');


 await reset();let {q}=await prepared();const beforeNo=await raw();await asked(q);await answer(q.id,false);assert.equal((await row(q.id)).status,'rejected');assert.equal(await linkCount(),0);assert.deepEqual(await raw(),beforeNo);assert.equal(await total(),167164);await answer(q.id,false);assert.equal(await prepare(),0,'rejected credit never generates the same prompt again');
 await denied(()=>answer(q.id,true));assert.equal(await linkCount(),0,'a later yes cannot reverse an explicit rejection');
 await reset();({q}=await prepared());const beforeYes=await raw();await asked(q);const yes=await answer(q.id,true);assert.ok(yes&&typeof yes==='object');assert.equal((await row(q.id)).status,'confirmed');assert.equal(await linkCount(),1);assert.equal(await total(),85016);assert.deepEqual(await raw(),beforeYes);
 assert.equal((await answer(q.id,true)).status,yes.status,'repeated explicit yes returns the same confirmation status');assert.equal(await linkCount(),1);assert.equal(await prepare(),0);
 // Replaying an old button is idempotent, but must not claim the accounting
 // correction is still active after a deliberate undo or newer bank facts.
 for(const [change,column,value] of [['undo'],['bank amount','amount','850.17'],['bank currency','currency','USD'],['bank date','transaction_date','1900-01-01']]){
  await root();await db.exec('begin');
  try{
   if(change==='undo'){await owned();assert.equal(await rpc('zelo_of_undo_credit_pix',[owner,'business',yes.link]),true);}
   else{await db.query(`update open_finance.movements set ${column}=$1 where id=$2`,[value,q.credit_movement]);await owned();}
   const replay=await denied(()=>answer(q.id,true));assert.notEqual(replay?.status,'confirmed',`${change}: replay must not report an inactive correction as confirmed`);
   await root();const active=(await db.query('select count(*)::int n from open_finance.credit_pix_links where voided_at is null')).rows[0].n;
   assert.equal(active,change==='undo'?0:1,'an old button never silently creates another reconciliation');
  }finally{await db.exec('rollback');}
 }
 console.log('PASS: correlated yes/no, exact financial result and replay idempotency');

 await reset();({q}=await prepared());await denied(()=>answer(q.id,true));assert.equal(await linkCount(),0,'pending is not an answered question');
 const correct=await claim(q.id);assert.equal(await arm(q.id,randomUUID()),false);assert.equal(await finish(q.id,randomUUID(),'asked'),false);await denied(()=>answer(q.id,true));assert.equal(await linkCount(),0,'claimed is not asked');
 assert.equal(await arm(q.id,correct),true);await denied(()=>answer(q.id,true));assert.equal(await linkCount(),0,'sending is not asked');assert.equal(await finish(q.id,correct,'asked'),true);
 await scope(owner,otherCompany);assert.equal(await denied(()=>get(q.id)),null);await denied(()=>answer(q.id,true));await owned();assert.equal(await linkCount(),0);
 await scope(other,foreignCompany);assert.equal(await denied(()=>get(q.id,other)),null);await denied(()=>answer(q.id,true,foreignPhone,other));await owned();assert.equal(await linkCount(),0);
 await denied(()=>answer(q.id,true,phone,owner,'personal'));await denied(()=>answer(q.id,true,foreignPhone));assert.equal(await linkCount(),0);
 await root();await db.query("update wpp_phone_links set relation='Spouse' where phone=$1",[phone]);await owned();await denied(()=>answer(q.id,true));assert.equal(await linkCount(),0,'a non-holder cannot answer');
 await linkPhone(other,foreignCompany,phone);await owned();await denied(()=>answer(q.id,true));assert.equal(await linkCount(),0,'relinked phone cannot answer an old holder question');
 console.log('PASS: state, nonce, phone, holder, mode and company authorization');

 for(const [stage,column,value] of [['claim','amount','850.17'],['answer','amount','850.17'],['answer','transaction_date','1900-01-01'],['answer','source_type','COMPRA']]){
  await reset();const {pair,q:stale}=await prepared();if(stage==='answer')await asked(stale);
  await root();await db.query(`update open_finance.movements set ${column}=$1 where id=$2`,[value,pair.credit]);await owned();
  if(stage==='claim')assert.equal(await denied(()=>claim(stale.id)),null);else await denied(()=>answer(stale.id,true));
  assert.equal(await linkCount(),0,'changed bank facts never consume an old financial confirmation');assert.equal(await prepare(),0,'a changed credit is not immediately prompted again');
 }
 await reset();const renamed=await prepared();await root();
 await db.query("update open_finance.movements set description='Corrected Recipient' where id=$1",[renamed.pair.credit]);
 await db.query("insert into open_finance.movements(resource_id,user_id,environment,mode,resource_type,external_id,description,transaction_date,amount,currency,direction,classification,source_type) values($1,$2,'production','business','account','corrected-name-candidate','Corrected Recipient',current_date,821.48,'BRL','debit','unknown','PIX')",[renamed.pair.paymentResource,owner]);await owned();
 assert.equal((await get(renamed.q.id)).valid,false,'the unique current matching Pix must be the persisted payment ID, not a replacement candidate');
 assert.equal(await denied(()=>claim(renamed.q.id)),null);assert.equal(await linkCount(),0);
 await reset();const invalidTarget=await prepared();await root();await db.query('update open_finance.movements set amount=850.17 where id=$1',[invalidTarget.pair.credit]);await owned();
 await rpc('zelo_of_credit_pix_targets');assert.equal(await claim(invalidTarget.q.id),null,'the dispatcher claim rejects changed facts');assert.equal((await row(invalidTarget.q.id)).status,'stale');assert.equal((await rpc('zelo_of_credit_pix_targets')).length,0,'stale questions no longer consume dispatcher slots');
 console.log('PASS: stale snapshots fail closed before claim and before answer');

 await reset();({q}=await prepared());const firstToken=await claim(q.id);assert.match(firstToken,/^[a-f0-9-]{36}$/i);assert.equal(await claim(q.id),null);
 await root();await db.query("update open_finance.credit_pix_questions set lease_until=clock_timestamp()-interval '1 second' where id=$1",[q.id]);await owned();const nextToken=await claim(q.id);assert.match(nextToken,/^[a-f0-9-]{36}$/i);assert.notEqual(nextToken,firstToken);assert.equal(await arm(q.id,firstToken),false);assert.equal(await finish(q.id,firstToken,'pending'),false,'stale worker cannot release a new claim');
 assert.equal(await arm(q.id,nextToken),true);assert.ok((await row(q.id)).attempted_at);
 await root();await db.query("update open_finance.credit_pix_questions set lease_until=clock_timestamp()-interval '1 second' where id=$1",[q.id]);await owned();assert.equal(await claim(q.id),null,'expired sending is not retried automatically');await rpc('zelo_of_credit_pix_targets');assert.equal((await row(q.id)).status,'uncertain');assert.equal(await prepare(),0);
 console.log('PASS: claim retry, stale nonce and ambiguous sending recovery');

 await reset();const a=await prepared();const b=await makePair({workspace:otherCompany});await scope(owner,otherCompany);assert.equal(await prepare(),1);await owned();const all=await questions();const bq=all.find(x=>x.credit_movement===b.credit);assert.ok(bq);
 await asked(a.q);await linkPhone(owner,otherCompany);assert.equal(await claim(bq.id),null,'daily cap is per holder across companies');
 await root();await db.query("update open_finance.credit_pix_questions set attempted_at=now()-interval '2 days',status='rejected' where id=$1",[a.q.id]);await scope(owner,otherCompany);assert.match(await claim(bq.id),/^[a-f0-9-]{36}$/i,'a previous day does not permanently suppress future questions');
 console.log('PASS: holder daily cap spans companies');
 await reset();for(let i=0;i<20;i++){await makePair();assert.equal(await prepare(),1);}
 const later=await makePair({user:other,workspace:foreignCompany});assert.equal(await prepare(other),1);
 const rotatingQuestions=await questions();const laterId=rotatingQuestions.find(item=>item.credit_movement===later.credit).id;
 const firstPage=await rpc('zelo_of_credit_pix_targets');assert.equal(firstPage.length,20);assert.equal(firstPage.some(item=>item.id===laterId),false);
 const nextPage=await rpc('zelo_of_credit_pix_targets');assert.ok(nextPage.some(item=>item.id===laterId),'the next pass reaches a later holder even when the first twenty cannot send');
 for(const question of await questions()){assert.equal(question.attempted_at,null,'rotation is not a send attempt');assert.equal(question.token,null,'rotation does not reserve a question');assert.equal(question.status,'pending');}
 console.log('PASS: bounded target rotation reaches later holders without claiming or consuming quota');


 await reset();({q}=await prepared());
 for(const [column,value] of [['relation','Spouse'],['access','personal'],['active_workspace_mode','personal'],['active_company_id',otherCompany]]){
  await root();await db.exec('begin');
  try{await db.query(`update wpp_phone_links set ${column}=$1 where phone=$2`,[value,phone]);await owned();assert.equal((await rpc('zelo_of_credit_pix_targets')).length,0,`targets recheck phone ${column}`);}finally{await db.exec('rollback');}
 }
 await root();await db.exec('begin');try{await db.query("update users set status='inactive' where id=$1",[owner]);await owned();assert.equal((await rpc('zelo_of_credit_pix_targets')).length,0,'inactive account has no targets');}finally{await db.exec('rollback');}
 await root();
 for(const schema of ['public','open_finance']){
  assert.equal((await db.query("select has_schema_privilege('zelo_of_workspace',$1,'CREATE') allowed",[schema])).rows[0].allowed,false,'temporary schema CREATE must be revoked after ownership transfer');
  assert.equal((await db.query("select has_schema_privilege('zelo_of_workspace',$1,'USAGE') allowed",[schema])).rows[0].allowed,true,'existing runtime schema USAGE must remain');
 }
 assert.equal((await db.query("select exists(select 1 from pg_auth_members where roleid='zelo_of_workspace'::regrole and member=current_user::regrole) member")).rows[0].member,false,'temporary migration-role membership must be revoked');
 const meta=(await db.query("select relrowsecurity rls,relforcerowsecurity forced from pg_class where oid='open_finance.credit_pix_questions'::regclass")).rows[0];assert.equal(meta.rls,true);assert.equal(meta.forced,true);
 const quotaSignature='open_finance.credit_pix_holder_busy(uuid,uuid)';
 const quota=(await db.query('select proconfig,prosecdef from pg_proc where oid=$1::regprocedure',[quotaSignature])).rows[0];assert.equal(quota.prosecdef,true);assert.ok(quota.proconfig.includes('row_security=off'));
 for(const role of ['anon','authenticated','service_role'])assert.equal((await db.query("select has_function_privilege($1,$2,'EXECUTE') allowed",[role,quotaSignature])).rows[0].allowed,false,'quota helper has no direct client/service access');
 assert.equal((await db.query("select has_function_privilege('zelo_of_workspace',$1,'EXECUTE') allowed",[quotaSignature])).rows[0].allowed,true);
 const signatures=['prepare_credit_pix_questions(uuid,text)','get_credit_pix_question(uuid,text,uuid)','claim_credit_pix_question(uuid,text,uuid,text)','arm_credit_pix_question(uuid,text,uuid,uuid)','finish_credit_pix_question(uuid,text,uuid,uuid,text)','answer_credit_pix_question(uuid,text,uuid,text,boolean)','credit_pix_targets()'].map(x=>'public.zelo_of_'+x);
 for(const signature of signatures){
  const fn=(await db.query('select pg_get_userbyid(proowner) owner,proconfig,prosecdef from pg_proc where oid=$1::regprocedure',[signature])).rows[0];assert.equal(fn.prosecdef,true);assert.ok(fn.proconfig.includes(signature.endsWith('targets()')?'row_security=off':'row_security=on'));
  if(!signature.endsWith('targets()'))assert.equal(fn.owner,'zelo_of_workspace');
  for(const role of ['anon','authenticated'])assert.equal((await db.query("select has_function_privilege($1,$2,'EXECUTE') allowed",[role,signature])).rows[0].allowed,false);
  assert.equal((await db.query("select has_function_privilege('service_role',$1,'EXECUTE') allowed",[signature])).rows[0].allowed,true);
 }
 for(const role of ['anon','authenticated','service_role']){
  for(const privilege of ['SELECT','INSERT','UPDATE','DELETE'])assert.equal((await db.query('select has_table_privilege($1,$2,$3) allowed',[role,'open_finance.credit_pix_questions',privilege])).rows[0].allowed,false);
  await db.exec('set role '+role);await assert.rejects(db.query('select * from open_finance.credit_pix_questions'),/permission denied/);await root();
 }
 console.log('PASS: fresh target authorization, forced RLS and scoped service-only RPCs');
}catch(error){console.error(error.stack??error.message);process.exitCode=1;}finally{await db.close();}
