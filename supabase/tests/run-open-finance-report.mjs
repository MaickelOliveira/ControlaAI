import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const {PGlite}=await import(pathToFileURL(process.argv[2]).href);
const db=new PGlite(),owner='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
const sql=path=>readFile(new URL(path,import.meta.url),'utf8');
const rpc=async(name,args)=>(await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as result`,args)).rows[0].result;
try {
  await db.exec(await sql('./open_finance_fixtures.sql'));
  for(const name of ['storage','server_access','consents','sync_queue','report']) {
    const times={storage:'193000',server_access:'213000',consents:'220000',sync_queue:'230000',report:'234000'};
    try{await db.exec(await sql(`../migrations/20261009${times[name]}_open_finance_${name}.sql`));}catch(e){if(e.code!=='ENOENT')throw e;}
  }
  await db.exec(`insert into open_finance.user_access(user_id,country_code,country_verified_at,enabled) values('${owner}','BR',now(),true),('${other}','BR',now(),true)`);
  const source={id:'10000000-0000-4000-8000-000000000001',institution_id:'20000000-0000-4000-8000-000000000001',institution_name:'Test Bank',cliente_user_id:owner,status:'AUTHORISED',products:['ACCOUNT','CREDIT_CARD_ACCOUNT']};
  await db.exec('set role service_role');
  const connection=await rpc('zelo_of_save_consent',[owner,'personal',JSON.stringify(source)]);
  await db.exec('reset role');
  for(const [kind,id] of [['card','card-1'],['account','account-1']]) await db.query(`insert into open_finance.resources(connection_id,user_id,environment,mode,resource_type,external_id,name,currency,available_amount) values($1,$2,'production','personal',$3,$4,$4,'BRL','9999999999999999.12345678')`,[connection.id,owner,kind,id]);
  const cards=(await db.query(`select id from open_finance.resources where external_id='card-1'`)).rows[0].id;
  const account=(await db.query(`select id from open_finance.resources where external_id='account-1'`)).rows[0].id;
  const insert=async(id,resource,kind,currency,amount,classification,direction='debit',date='2026-09-10')=>db.query(`insert into open_finance.movements(resource_id,user_id,environment,mode,resource_type,external_id,description,transaction_date,currency,amount,classification,direction) values($1,$2,'production','personal',$3,$4,'Source description',$5,$6,$7,$8,$9)`,[resource,owner,kind,id,date,currency,amount,classification,direction]);
  for(let i=0;i<51;i++)await insert(`buy-${i}`,cards,'card','BRL','0.10','purchase');
  await insert('usd',cards,'card','USD','8.25','purchase');
  await insert('payment',account,'account','BRL','500','bill_payment');
  await insert('transfer',account,'account','BRL','700','transfer');
  await insert('debit',account,'account','BRL','200','unknown');
  await insert('refund',cards,'card','BRL','10','refund','credit');
  await insert('missing',cards,'card',null,null,'purchase');
  await insert('undated',cards,'card','BRL','90','purchase','debit',null);
  await db.exec('set role service_role');
  await rpc('zelo_of_enqueue',[owner,'personal',connection.id,JSON.stringify({kind:'catalog',family:'accounts',external_resource_id:source.id,window:{}})]);
  const report=await rpc('zelo_of_report',[owner,'personal','2026-09-01','2026-09-30',null]);
  assert.equal(report.sync_pending,true,'queued work is visible before its first page');
  assert.equal(report.movements.length,50);assert.ok(report.next);
  assert.equal(report.totals.find(t=>t.kind==='card_purchases'&&t.currency==='BRL').amount,'5.10000000','exact decimal sum');
  assert.equal(report.totals.find(t=>t.kind==='card_purchases'&&t.currency==='USD').amount,'8.25000000','never mix currencies');
  assert.equal(report.totals.find(t=>t.kind==='account_debits').amount,'200.00000000','unreconciled debit is separate');
  assert.equal(report.totals.find(t=>t.kind==='excluded').amount,'1200.00000000','bill payments and transfers are excluded');
  assert.equal(report.missing_dates,1);assert.equal(report.history_complete,false);
  assert.ok(!JSON.stringify(report).includes('external_id'),'no external bank identifier field in browser DTO');
  const second=await rpc('zelo_of_report',[owner,'personal','2026-09-01','2026-09-30',report.next]);
  assert.equal(new Set([...report.movements,...second.movements].map(m=>m.id)).size,57);assert.equal(second.next,null);
  assert.equal((await rpc('zelo_of_report',[other,'personal','2026-09-01','2026-09-30',null])).movements.length,0);
  assert.equal((await rpc('zelo_of_report',[owner,'business','2026-09-01','2026-09-30',null])).movements.length,0);
  await assert.rejects(rpc('zelo_of_report',[other,'personal','2026-09-01','2026-09-30',report.next]),/OF_CURSOR_INVALID/);
  await assert.rejects(rpc('zelo_of_report',[owner,'personal','2025-01-01','2026-09-30',null]),/OF_PERIOD_INVALID/);
  const overview=await rpc('zelo_of_overview',[owner,'production','personal']);
  assert.equal(overview.resources[0].available_amount,'9999999999999999.12345678','snapshot DTO retains precision');
  await db.exec('reset role;set role authenticated');
  await assert.rejects(rpc('zelo_of_report',[owner,'personal','2026-09-01','2026-09-30',null]),/permission denied/);
  console.log('Bank report passed: exact currencies, classification, pagination, missing history and owner isolation');
}catch(e){console.error(e.message);if(e.where)console.error(e.where);process.exitCode=1;}finally{await db.close();}
