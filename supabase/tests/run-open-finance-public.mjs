import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const {PGlite}=await import(pathToFileURL(process.argv[2]).href);
const db=new PGlite();
const sql=p=>readFile(new URL(p,import.meta.url),'utf8');
const a='00000000-0000-4000-8000-000000000001',b='00000000-0000-4000-8000-000000000002',disabled='00000000-0000-4000-8000-000000000003';
const rpc=async(name,args)=>(await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as value`,args)).rows[0].value;
try{
  await db.exec(await sql('./open_finance_fixtures.sql'));
  await db.exec("alter table public.users add column status text default 'active'; alter table public.users add column plan text default 'business'; alter table public.users add column email text");
  for(const migration of ['20261009193000_open_finance_storage','20261009213000_open_finance_server_access','20261009220000_open_finance_consents','20261009230000_open_finance_sync_queue'])await db.exec(await sql('../migrations/'+migration+'.sql'));
  try{await db.exec(await sql('../migrations/20261010230000_open_finance_public.sql'));}catch(e){if(e.code!=='ENOENT')throw e;}
  for(const role of ['anon','authenticated']){
    await db.exec('set role '+role);
    await assert.rejects(rpc('zelo_of_enable_brazil',[a,'personal','BR',true]),/permission denied/);
    await assert.rejects(rpc('zelo_of_worker_scope',['personal']),/permission denied/);
    await assert.rejects(rpc('zelo_of_event_target',['unknown','consents']),/permission denied/);
    await db.exec('reset role');
  }
  await db.exec('set role service_role');
  await assert.rejects(rpc('zelo_of_enable_brazil',[a,'personal','PT',true]),/OF_COUNTRY_INVALID/);
  await assert.rejects(rpc('zelo_of_enable_brazil',[a,'personal','BR',false]),/OF_COUNTRY_INVALID/);
  assert.equal(await rpc('zelo_of_enable_brazil',[a,'personal','BR',true]),true);
  assert.equal(await rpc('zelo_of_enable_brazil',[b,'business','BR',true]),true);
  assert.equal(await rpc('zelo_of_enable_brazil',[a,'personal','BR',true]),true);
  const save=(user,mode,n)=>rpc('zelo_of_save_consent',[user,mode,JSON.stringify({id:`10000000-0000-4000-8000-00000000000${n}`,cliente_user_id:user,institution_id:'20000000-0000-4000-8000-000000000001',institution_name:'Test bank',status:'AUTHORISED',products:['ACCOUNT']})]);
  const ca=await save(a,'personal',1),cb=await save(b,'business',2);
  assert.deepEqual(await rpc('zelo_of_event_target',['10000000-0000-4000-8000-000000000002','consents']),{id:cb.id,userId:b,mode:'business',status:'active'});
  assert.equal(await rpc('zelo_of_event_target',['unknown','consents']),null);
  for(const [user,mode,c,n]of [[a,'personal',ca,1],[b,'business',cb,2]])await rpc('zelo_of_enqueue',[user,mode,c.id,JSON.stringify({kind:'consent',family:'consents',external_resource_id:`10000000-0000-4000-8000-00000000000${n}`,window:{}})]);
  assert.deepEqual(await rpc('zelo_of_worker_scope',['personal']),{userId:a,mode:'personal',environment:'production'});
  assert.deepEqual(await rpc('zelo_of_worker_scope',['business']),{userId:b,mode:'business',environment:'production'});
  assert.equal((await rpc('zelo_of_capabilities',[a,'personal'])).worker_recent,true);
  assert.equal((await rpc('zelo_of_capabilities',[b,'business'])).worker_recent,true);
  await assert.rejects(rpc('zelo_of_connection',[b,'personal',ca.id]),/OF_CONNECTION_NOT_FOUND/);
  await db.exec('reset role');
  await db.exec(`update public.users set plan='personal',email='owner@example.test' where id='${a}'; update open_finance.user_access set country_confirmation_source='operator_verified' where user_id='${a}'`);
  await db.exec('set role service_role');
  const oldOwner=await save(a,'business',3);
  await rpc('zelo_of_enqueue',[a,'business',oldOwner.id,JSON.stringify({kind:'consent',family:'consents',external_resource_id:'10000000-0000-4000-8000-000000000003',window:{}})]);
  await db.exec('reset role');
  await db.exec(`update open_finance.sync_jobs set available_at=now()-interval '10 minutes' where connection_id='${oldOwner.id}'`);
  await db.exec('set role service_role');
  assert.equal((await rpc('zelo_of_worker_scope',['business',null])).userId,b,'ineligible oldest PJ must not block another customer');
  assert.equal((await rpc('zelo_of_worker_scope',['business','different@example.test'])).userId,b);
  assert.equal((await rpc('zelo_of_worker_scope',['business','owner@example.test'])).userId,a,'explicit current owner exception is honored');
  await db.exec('reset role');
  await db.exec(`insert into open_finance.user_access(user_id,country_code,country_verified_at,enabled) values('${disabled}','BR',now(),false); update public.users set status='inactive' where id='${b}'`);
  await db.exec('set role service_role');
  await assert.rejects(rpc('zelo_of_enable_brazil',[disabled,'personal','BR',true]),/OF_ACCESS_DISABLED/);
  assert.equal(await rpc('zelo_of_worker_scope',['business']),null);
  await assert.rejects(rpc('zelo_of_enable_brazil',[b,'business','BR',true]),/OF_ACCESS_DENIED/);
  await db.exec('reset role');
  await db.exec(await sql('../rollback/20261010230000_open_finance_public.sql'));
  await db.exec(await sql('../migrations/20261010230000_open_finance_public.sql'));
  console.log('Public eligibility, service-only operations, two-holder/two-mode isolation and worker routing passed');
}finally{await db.close();}
