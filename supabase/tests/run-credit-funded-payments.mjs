import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';

// Isolated PostgreSQL contract test. All identities and movements are fictitious.
// node supabase/tests/run-credit-funded-payments.mjs <pglite-module>
const {PGlite}=await import(pathToFileURL(process.argv[2]).href);
const db=new PGlite();
const owner='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
const sql=file=>readFile(new URL(file,import.meta.url),'utf8');
const rpc=async(name,args)=>{
 if(name==='zelo_of_confirm_credit_pix'&&args.length===8)args=[...args,'2026-10-11','2026-10-11'];
 return(await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) value`,args)).rows[0].value;
};
const root=()=>db.exec('reset role');
const scope=async(user,company)=>{await db.exec('set role service_role');await db.query("select set_config('request.headers',$1,false)",[JSON.stringify({'x-zelo-owner':user,'x-zelo-company':company})]);};
const cents=value=>{const [whole,fraction='']=String(value).split('.');assert.ok(!/[1-9]/.test(fraction.slice(2)),'totals must retain exact cents');return BigInt(whole)*100n+BigInt((fraction+'00').slice(0,2));};
const total=report=>report.totals.filter(row=>row.currency==='BRL').reduce((sum,row)=>sum+cents(row.amount),0n);
let sequence=0;
try{
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);');
 await db.exec((await sql('../schema.sql')).replace('create extension if not exists "pgcrypto";',''));
 for(const [id,phone,email] of [[owner,'5511999990001','one@example.test'],[other,'5511999990002','two@example.test']])await db.query("insert into users(id,phone,name,email,password_hash,plan,status,trial_ends_at) values($1,$2,'Fixture',$3,'fake','business','active',now()+interval '7 days')",[id,phone,email]);
 for(const file of ['20261009193000_open_finance_storage','20261009213000_open_finance_server_access','20261009220000_open_finance_consents','20261009230000_open_finance_sync_queue','20261009234000_open_finance_report','20261010185000_open_finance_categories','20261010230000_open_finance_public','20261011030000_open_finance_notifications','20261011090000_open_finance_connection_management','20261011093000_open_finance_subscription_retirement','20261011110000_open_finance_archive_history','20261011160000_companies','20261011170000_open_finance_companies','20261011210000_nfse_preparation','20261012000000_bank_identity','20261012010000_company_archive','20261012020000_finance_account_filter','20261012030000_bank_workspace_reconnect','20261012040000_preserve_bank_movement_facts'])await db.exec(await sql('../migrations/'+file+'.sql'));
 const reportMetadata=async()=>(await db.query("select pg_get_userbyid(proowner) owner,proacl::text,proconfig,prosecdef,provolatile from pg_proc where oid='public.zelo_of_report(uuid,text,date,date,uuid)'::regprocedure")).rows[0];
 const priorReportMetadata=await reportMetadata();
 try{await db.exec(await sql('../migrations/20261012050000_credit_funded_payments.sql'));}catch(error){if(error.code!=='ENOENT')throw error;console.log('RED setup: migration absent; testing the missing RPC contract against the previous schema.');}
 assert.deepEqual(await reportMetadata(),priorReportMetadata,'report replacement preserves owner, grants, security and volatility');
 const company=(await db.query('select id from companies where user_id=$1 and is_default',[owner])).rows[0].id;
 const otherCompany=(await db.query("insert into companies(user_id,name) values($1,'Second fixture company') returning id",[owner])).rows[0].id;
 const foreignCompany=(await db.query('select id from companies where user_id=$1 and is_default',[other])).rows[0].id;
 const makePair=async(user=owner,workspace=company,mode='business')=>{
  await scope(user,workspace);await rpc('zelo_of_enable_brazil',[user,mode,'BR',true]);
  const n=++sequence,external=`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
  const connection=await rpc('zelo_of_save_consent',[user,mode,JSON.stringify({id:external,cliente_user_id:user,institution_id:'20000000-0000-4000-8000-000000000001',institution_name:'Fixture Bank',status:'AUTHORISED',products:['ACCOUNT','CREDIT_CARD_ACCOUNT']})]);
  await root();const ids={};
  for(const [role,type,source,amount] of [['credit','card','OPERACOES_CREDITO_CONTRATADAS_CARTAO','850.16'],['payment','account','PIX','821.48']]){
   const resource=(await db.query("insert into open_finance.resources(connection_id,user_id,environment,mode,resource_type,external_id,name,subtype) values($1,$2,'production',$3,$4,$5,'Fixture product',$6) returning id",[connection.id,user,mode,type,`resource-${n}-${role}`,type==='card'?'credit-cards':'accounts'])).rows[0].id;
   ids[role]=(await db.query("insert into open_finance.movements(resource_id,user_id,environment,mode,resource_type,external_id,description,transaction_date,amount,currency,direction,classification,source_type) values($1,$2,'production',$3,$4,$5,'Fictitious payment','2026-10-11',$6,'BRL','debit','unknown',$7) returning id",[resource,user,mode,type,`movement-${n}-${role}`,amount,source])).rows[0].id;
   ids[role+'Resource']=resource;
  }
  await scope(user,workspace);return {...ids,user,company:workspace,mode};
 };
 const pair=await makePair();
 const confirm=(p=pair,overrides=[])=>rpc('zelo_of_confirm_credit_pix',overrides.length?overrides:[p.user,p.mode,p.credit,p.payment,'850.16','821.48','28.68',true]);
 const undo=id=>rpc('zelo_of_undo_credit_pix',[owner,'business',id]);
 const report=(after=null)=>rpc('zelo_of_report',[owner,'business','2026-10-01','2026-10-31',after]);
 const raw=async()=>{await root();const rows=(await db.query('select * from open_finance.movements where id=any($1::uuid[]) order by id',[[pair.credit,pair.payment]])).rows;await scope(owner,company);return rows;};
 const before=await raw();assert.equal(total(await report()),167164n,'unconfirmed facts must retain their original total');
 const link=await confirm();assert.match(link.id,/^[a-f0-9-]{36}$/i,'confirmation returns a persisted link ID');
 console.log('PASS: confirmation RPC exists');
 assert.deepEqual(await raw(),before,'confirmation does not rewrite raw bank facts');
 const adjusted=await report();assert.equal(total(adjusted),85016n,'only 28.68 of credit charges plus 821.48 payment count');
 for(const [role,id,amount] of [['credit',pair.credit,'850.16000000'],['payment',pair.payment,'821.48000000']]){
  const movement=adjusted.movements.find(row=>row.id===id);assert.equal(movement.amount,amount);
  assert.equal(movement.credit_reconciliation.status,'active');assert.equal(movement.credit_reconciliation.role,role);assert.equal(movement.credit_reconciliation.id,link.id);
 }
 assert.equal((await confirm()).id,link.id,'same active pair is idempotent');
 for(const values of [['850.16','821.48','28.68',false],['850.16','821.48','28.68',null],['850.17','821.48','28.69',true],['850.16','821.49','28.67',true],['850.16','821.48','28.67',true],['850.161','821.48','28.681',true],['0','0','0',true],['-850.16','821.48','-1671.64',true]])await assert.rejects(confirm(pair,[owner,'business',pair.credit,pair.payment,...values]),'invalid confirmation/value snapshots must be rejected even for a repeated pair');
 const spare=await makePair();await scope(owner,company);
 await assert.rejects(confirm(pair,[owner,'business',pair.credit,spare.payment,'850.16','821.48','28.68',true]),'credit cannot be reused');
 await assert.rejects(confirm(pair,[owner,'business',spare.credit,pair.payment,'850.16','821.48','28.68',true]),'payment cannot be reused');
 // Exclude the unused fixture from the report while keeping IDs for validation.
 await root();await db.query("update open_finance.movements set transaction_date='2025-01-01' where id=any($1::uuid[])",[[spare.credit,spare.payment]]);await scope(owner,company);
 console.log('PASS: idempotency, explicit confirmation, exact cents and exclusive active pair');

 for(const foreign of [await makePair(owner,otherCompany),await makePair(other,foreignCompany),await makePair(owner,company,'personal')]){
  await scope(owner,company);
  await assert.rejects(confirm(pair,[owner,'business',pair.credit,foreign.payment,'850.16','821.48','28.68',true]),'cross-workspace payment rejected');
  await assert.rejects(confirm(pair,[owner,'business',foreign.credit,pair.payment,'850.16','821.48','28.68',true]),'cross-workspace credit rejected');
 }
 const assertLinkUntouched=async()=>{
  await root();const row=(await db.query('select voided_at from open_finance.credit_pix_links where id=$1',[link.id])).rows[0];assert.equal(row.voided_at,null,'foreign undo must leave the original link active');
  await scope(owner,company);assert.equal(total(await report()),85016n,'foreign undo must not change the original accounting effect');assert.deepEqual(await raw(),before);
 };
 await scope(owner,otherCompany);assert.equal(await undo(link.id),false,'another company sees not found');await assertLinkUntouched();
 await scope(other,foreignCompany);assert.equal(await rpc('zelo_of_undo_credit_pix',[other,'business',link.id]),false,'another holder sees not found');await assertLinkUntouched();
 await scope(owner,company);assert.equal(await rpc('zelo_of_undo_credit_pix',[owner,'personal',link.id]),false,'another mode sees not found');await assertLinkUntouched();
 console.log('PASS: holder, company and mode isolation');

 await root();
 for(const signature of ['public.zelo_of_confirm_credit_pix(uuid,text,uuid,uuid,numeric,numeric,numeric,boolean,date,date)','public.zelo_of_undo_credit_pix(uuid,text,uuid)']){
  const fn=(await db.query('select pg_get_userbyid(proowner) owner,proconfig,prosecdef from pg_proc where oid=$1::regprocedure',[signature])).rows[0];
  assert.equal(fn.owner,'zelo_of_workspace');assert.equal(fn.prosecdef,true);assert.ok(fn.proconfig.includes('row_security=on'));
  for(const role of ['anon','authenticated'])assert.equal((await db.query("select has_function_privilege($1,$2,'EXECUTE') allowed",[role,signature])).rows[0].allowed,false);
  assert.equal((await db.query("select has_function_privilege('service_role',$1,'EXECUTE') allowed",[signature])).rows[0].allowed,true);
 }
 assert.equal((await db.query("select relrowsecurity enabled from pg_class where oid='open_finance.credit_pix_links'::regclass")).rows[0].enabled,true);
 const ownedFks=(await db.query("select conkey from pg_constraint where conrelid='open_finance.credit_pix_links'::regclass and confrelid='open_finance.movements'::regclass and contype='f'")).rows;
 assert.ok(ownedFks.length>=2&&ownedFks.every(fk=>fk.conkey.length>=4),'both movement foreign keys must include owner/environment/mode');
 for(const role of ['anon','authenticated','service_role']){
  for(const privilege of ['SELECT','INSERT','UPDATE','DELETE'])assert.equal((await db.query('select has_table_privilege($1,$2,$3) allowed',[role,'open_finance.credit_pix_links',privilege])).rows[0].allowed,false);
  await db.exec('set role '+role);await assert.rejects(db.query('select * from open_finance.credit_pix_links'),/permission denied/);await root();
 }
 for(const privilege of ['SELECT','INSERT','UPDATE'])assert.equal((await db.query('select has_table_privilege($1,$2,$3) allowed',['zelo_of_workspace','open_finance.credit_pix_links',privilege])).rows[0].allowed,true);
 console.log('PASS: private table, owned FKs, scoped definer and service-only RPCs');

 // Snapshot changes suspend both sides of the old adjustment. Unknown values
 // must never leave the old financial correction active.
 for(const [id,column,value] of [[pair.credit,'amount','850.17'],[pair.payment,'amount','821.49'],[pair.credit,'transaction_date','2026-10-12'],[pair.payment,'transaction_date','2026-10-12'],[pair.credit,'source_type','COMPRA'],[pair.payment,'source_type','TED'],[pair.credit,'direction','credit'],[pair.payment,'classification','transfer'],[pair.credit,'currency','USD']]){
  await root();await db.exec('begin');
  try{
   await db.query(`update open_finance.movements set ${column}=$1 where id=$2`,[value,id]);await scope(owner,company);
   const changed=await report();
   for(const movement of changed.movements.filter(row=>row.id===pair.credit||row.id===pair.payment))assert.equal(movement.credit_reconciliation.status,'review',`changed ${column} suspends both roles`);
   if(column==='amount')assert.equal(total(changed),167165n,'stale snapshots restore unadjusted totals');
   await assert.rejects(confirm(),'cannot silently reuse stale confirmation');
  }finally{await db.exec('rollback');}
 }
 await scope(owner,company);assert.equal(await undo(link.id),true);assert.equal(await undo(link.id),true,'undo is idempotent');
 assert.equal(total(await report()),167164n,'undo restores the original accounting effect');
 assert.deepEqual(await raw(),before,'undo preserves raw bank facts');
 const again=await confirm();assert.notEqual(again.id,link.id,'reconfirmation preserves the voided audit record');
 await root();const audit=(await db.query('select id,voided_at,gross_amount::text,payment_amount::text,charges_amount::text,credit_date::text,payment_date::text from open_finance.credit_pix_links where id=any($1::uuid[]) order by id',[[link.id,again.id]])).rows;
 assert.equal(audit.length,2);assert.ok(audit.find(row=>row.id===link.id).voided_at);assert.equal(audit.find(row=>row.id===again.id).voided_at,null);
 for(const row of audit){assert.equal(cents(row.gross_amount),85016n);assert.equal(cents(row.payment_amount),82148n);assert.equal(cents(row.charges_amount),2868n);assert.equal(row.credit_date,'2026-10-11');assert.equal(row.payment_date,'2026-10-11');}
 await scope(owner,company);
 console.log('PASS: stale facts suspend adjustment; undo and reconfirm preserve audit');
 // Confirm an otherwise unused pair only after testing type/currency/date gates.
 await root();await db.query("update open_finance.movements set transaction_date='2026-10-11' where id=any($1::uuid[])",[[spare.credit,spare.payment]]);
 // The UI saw both dates on October 11; a correction before the first save
 // must reject even when amounts and every other eligibility fact still match.
 for(const id of [spare.credit,spare.payment]){
  await root();await db.exec('begin');
  try{
   await db.query("update open_finance.movements set transaction_date='2026-10-12' where id=$1",[id]);await scope(owner,company);
   await db.exec('savepoint first_confirmation');
   await assert.rejects(confirm(spare),/OF_CREDIT_PIX_FACTS_CHANGED/,'stale UI date rejects the first confirmation');
   await db.exec('rollback to savepoint first_confirmation');
   await root();assert.equal((await db.query('select count(*)::int count from open_finance.credit_pix_links where credit_movement=$1 or payment_movement=$2',[spare.credit,spare.payment])).rows[0].count,0,'rejected stale dates leave no link');
  }finally{await db.exec('rollback');}
 }
 await scope(owner,company);
 for(const dates of [[null,'2026-10-11'],['2026-10-11',null]])await assert.rejects(confirm(spare,[owner,'business',spare.credit,spare.payment,'850.16','821.48','28.68',true,...dates]),/OF_CREDIT_PIX_INVALID/,'both original UI dates are mandatory');
 console.log('PASS: first confirmation rejects changed or absent UI snapshot dates');
 for(const [id,column,value] of [[spare.credit,'currency','USD'],[spare.payment,'currency','USD'],[spare.credit,'source_type','COMPRA'],[spare.payment,'source_type','TED'],[spare.credit,'direction','credit'],[spare.payment,'direction','credit'],[spare.payment,'classification','transfer'],[spare.credit,'classification','bill_payment'],[spare.payment,'classification','investment'],[spare.payment,'transaction_date',null],[spare.credit,'amount','850.161']]){
  await root();await db.exec('begin');
  try{await db.query(`update open_finance.movements set ${column}=$1 where id=$2`,[value,id]);await scope(owner,company);await assert.rejects(confirm(spare),`invalid ${column} must reject a fresh pair`);}finally{await db.exec('rollback');}
 }
 await root();await db.query("update open_finance.movements set transaction_date='2025-01-01' where id=any($1::uuid[])",[[spare.credit,spare.payment]]);
 for(let i=0;i<55;i++)await db.query("insert into open_finance.movements(resource_id,user_id,environment,mode,resource_type,external_id,description,transaction_date,amount,currency,direction,classification,source_type) values($1,$2,'production','business','account',$3,'Other fictitious expense','2026-10-11',1,'BRL','debit','unknown','TED')",[pair.paymentResource,owner,'pagination-'+i]);
 await scope(owner,company);const first=await report();assert.ok(first.next);const second=await report(first.next);
 assert.equal(first.movements.length,50);assert.deepEqual(second.totals,first.totals,'totals apply to the whole range, not the visible page');assert.equal(total(first),90516n);
 console.log('PASS: ineligible facts rejected, other expenses untouched and totals paginate correctly');
 const zeroFee=await makePair();await root();await db.query('update open_finance.movements set amount=850.16 where id=$1',[zeroFee.payment]);await scope(owner,company);
 const zeroLink=await confirm(zeroFee,[owner,'business',zeroFee.credit,zeroFee.payment,'850.16','850.16','0',true]);assert.ok(zeroLink.id);
 assert.equal((await confirm(zeroFee,[owner,'business',zeroFee.credit,zeroFee.payment,'850.16','850.16','0',true])).id,zeroLink.id);
 assert.equal(total(await report()),175532n,'a zero-fee credit counts only its actual Pix payment');
 await root();const zeroAudit=(await db.query('select charges_amount::text from open_finance.credit_pix_links where id=$1',[zeroLink.id])).rows[0];assert.equal(cents(zeroAudit.charges_amount),0n);
 console.log('PASS: positive equal gross/payment with zero fees is valid and idempotent');
}catch(error){console.error(error.stack??error.message);process.exitCode=1;}finally{await db.close();}
