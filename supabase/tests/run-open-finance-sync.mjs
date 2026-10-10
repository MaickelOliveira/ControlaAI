import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db=new PGlite();
const owner='00000000-0000-4000-8000-000000000001', other='00000000-0000-4000-8000-000000000002';
const sql=path=>readFile(new URL(path,import.meta.url),'utf8');
const rpc=async(name,args)=>{
  // Advance the test clock for sequential claims; live SQL retains its rate gate.
  if(name==='zelo_of_claim'&&(await db.query('select current_user as role')).rows[0].role==='service_role') {
    await db.exec('reset role');await db.query('update open_finance.user_access set next_sync_claim_at=null where user_id=$1',[args[0]]);await db.exec('set role service_role');
  }
  const result=await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as result`,args);return result.rows[0].result;
};
try {
  await db.exec(await sql('./open_finance_fixtures.sql'));
  for(const migration of ['20261009193000_open_finance_storage','20261009213000_open_finance_server_access','20261009220000_open_finance_consents','20261009230000_open_finance_sync_queue']) {
    try{await db.exec(await sql('../migrations/'+migration+'.sql'));}catch(e){if(e.code!=='ENOENT')throw e;}
  }
  await db.exec(`insert into open_finance.user_access(user_id,country_code,country_verified_at,enabled) values('${owner}','BR',now(),true),('${other}','BR',now(),true)`);
  const consent={id:'10000000-0000-4000-8000-000000000001',institution_id:'20000000-0000-4000-8000-000000000001',institution_name:'Test Bank',cliente_user_id:owner,status:'AUTHORISED',products:['ACCOUNT','CREDIT_CARD_ACCOUNT','INVESTMENTS','CREDIT_OPERATIONS']};
  await db.exec('set role service_role');
  const connection=await rpc('zelo_of_save_consent',[owner,'personal',JSON.stringify(consent)]);
  const spec={kind:'catalog',family:'accounts',external_resource_id:consent.id,window:{}};
  const enqueue=()=>rpc('zelo_of_enqueue',[owner,'personal',connection.id,JSON.stringify(spec)]);
  const jobId=await enqueue();
  assert.equal((await rpc('zelo_of_webhook_target',[owner,'personal',consent.id,'consents'])).id,connection.id);
  assert.equal(await rpc('zelo_of_webhook_target',[other,'personal',consent.id,'consents']),null);
  assert.equal(await enqueue(),jobId,'redelivery must not duplicate active work');
  const job=await rpc('zelo_of_claim',[owner,'personal']);
  assert.equal(job.id,jobId);
  assert.equal((await rpc('zelo_of_capabilities',[owner,'personal'])).worker_recent,true);
  assert.equal((await rpc('zelo_of_capabilities',[owner,'business'])).worker_recent,false,'personal worker must not enable business connection');
  assert.equal(await rpc('zelo_of_claim',[owner,'personal']),null,'a running lease cannot be claimed twice');
  await assert.rejects(rpc('zelo_of_commit_page',[other,'personal',job.id,job.lease_token,'{}',null,'[]']),/OF_JOB_NOT_FOUND/);
  await assert.rejects(rpc('zelo_of_commit_page',[owner,'business',job.id,job.lease_token,'{}',null,'[]']),/OF_JOB_NOT_FOUND/);
  const resource={external_id:'account-1',resource_type:'account',name:'Account',subtype:'accounts',currency:'BRL',available_amount:'100',source_updated_at:'2026-10-09T10:00:00Z'};
  await rpc('zelo_of_commit_page',[owner,'personal',job.id,job.lease_token,JSON.stringify({resources:[resource]}),'second-page','[]']);
  const partial=await rpc('zelo_of_overview',[owner,'production','personal']);
  assert.equal(partial.resources[0].available_amount,100);
  assert.equal(partial.sync[0].status,'pending');
  assert.equal(partial.sync[0].last_successful_sync_at,null,'coverage advances only after final page');
  const page2=await rpc('zelo_of_claim',[owner,'personal']);
  assert.equal(page2.cursor,'second-page');
  await assert.rejects(rpc('zelo_of_commit_page',[owner,'personal',job.id,job.lease_token,'{}',null,'[]']),/OF_LEASE_INVALID/);
  await assert.rejects(rpc('zelo_of_commit_page',[owner,'personal',page2.id,page2.lease_token,JSON.stringify({resources:[{...resource,available_amount:'500',currency:null}]}),null,'[]']),/check constraint/);
  assert.equal((await rpc('zelo_of_overview',[owner,'production','personal'])).resources[0].available_amount,100,'failed page rolls back writes and progress');
  await assert.rejects(rpc('zelo_of_commit_page',[owner,'personal',page2.id,page2.lease_token,'{}','second-page','[]']),/OF_CURSOR_CYCLE/);
  await rpc('zelo_of_commit_page',[owner,'personal',page2.id,page2.lease_token,JSON.stringify({resources:[{...resource,available_amount:'50',source_updated_at:'2026-10-08T10:00:00Z'}]}),null,'[]']);
  const completed=await rpc('zelo_of_overview',[owner,'production','personal']);
  assert.equal(completed.resources[0].available_amount,100,'old source snapshots cannot overwrite newer balances');
  assert.equal(completed.sync[0].status,'complete');
  assert.ok(completed.sync[0].last_successful_sync_at);
  assert.equal((await db.query("select public.zelo_of_claim($1,'personal') as result",[owner])).rows[0].result,null,'distributed rate gate applies even after a completed page');
  const page=async(spec,rows,children=[])=>{
    await rpc('zelo_of_enqueue',[owner,'personal',connection.id,JSON.stringify(spec)]);
    const task=await rpc('zelo_of_claim',[owner,'personal']);
    await rpc('zelo_of_commit_page',[owner,'personal',task.id,task.lease_token,JSON.stringify(rows),null,JSON.stringify(children)]);
  };
  const card={external_id:'card-1',resource_type:'card',name:'Card',subtype:'credit-cards'};
  await page({...spec,family:'credit-cards'},{resources:[card],limits:[{resource_external_id:'card-1',line_key:'total',currency:'BRL',total_amount:'5000',available_amount:null}]});
  await page({kind:'transactions',family:'credit-cards',external_resource_id:'card-1',window:{}},{movements:[{resource_external_id:'card-1',resource_type:'card',external_id:'purchase-1',description:'Store',transaction_date:'2026-09-09',amount:'50',currency:'BRL',direction:'debit',classification:'purchase',bill_external_id:'bill-1'}]});
  await page({kind:'bills',family:'credit-cards',external_resource_id:'card-1',window:{}},{bills:[{resource_external_id:'card-1',external_id:'bill-1',currency:'BRL',total_amount:'50',status:'unknown'}]});
  await db.exec('reset role');
  const movement=(await db.query("select bill_id,amount from open_finance.movements where external_id='purchase-1'")).rows[0];
  assert.ok(movement.bill_id,'a later bill links only movements of that card');
  assert.equal(Number(movement.amount),50);
  await db.exec('set role service_role');
  const cardView=await rpc('zelo_of_overview',[owner,'production','personal']);
  assert.equal(cardView.limits[0].available_amount,null);
  await page({...spec,family:'loans'},{resources:[{external_id:'loan-1',resource_type:'loan',name:'Loan',subtype:'loans'}],credit:[{resource_external_id:'loan-1',resource_type:'loan',currency:'BRL',contract_amount:'1000',outstanding_amount:null}]});
  await page({kind:'reserves',family:'accounts',external_resource_id:'account-1',window:{}},{resources:[{external_id:'reserve-1.BRL',parent_external_id:'account-1',resource_type:'reserve',name:'Reserve',subtype:'reserved-balances',currency:'BRL',available_amount:'20'}]});
  const windowJob={kind:'transactions',family:'credit-cards',external_resource_id:'card-1',window:{fromUpdatedAt:'2026-10-09T00:00:00Z',toUpdatedAt:'2026-10-09T23:59:59Z'}};
  const failedId=await rpc('zelo_of_enqueue',[owner,'personal',connection.id,JSON.stringify(windowJob)]);
  for(let attempt=0;attempt<5;attempt++) {
    const failing=await rpc('zelo_of_claim',[owner,'personal']);
    await rpc('zelo_of_fail_job',[owner,'personal',failing.id,failing.lease_token,'POLP_HTTP_429']);
    await db.exec('reset role');await db.query('update open_finance.sync_jobs set available_at=now() where id=$1',[failedId]);await db.exec('set role service_role');
  }
  assert.ok((await rpc('zelo_of_overview',[owner,'production','personal'])).sync.some(s=>s.status==='failed'));
  assert.equal(await rpc('zelo_of_enqueue',[owner,'personal',connection.id,JSON.stringify({...windowJob,window:{},initial_only:true})]),null,'initial completion does not repeat full history');
  assert.equal(await rpc('zelo_of_retry_failed',[owner,'personal',connection.id]),1,'manual refresh recovers failed incremental separately');
  const recovered=await rpc('zelo_of_claim',[owner,'personal']);
  assert.equal(recovered.id,failedId);assert.deepEqual(recovered.filter_window,windowJob.window);
  await rpc('zelo_of_commit_page',[owner,'personal',recovered.id,recovered.lease_token,'{}',null,'[]']);
  const repeated=await enqueue();
  assert.notEqual(repeated,jobId,'a later event without a window must be processed again');
  const running=await rpc('zelo_of_claim',[owner,'personal']);
  await enqueue();
  await rpc('zelo_of_commit_page',[owner,'personal',running.id,running.lease_token,'{}',null,'[]']);
  const rerun=await rpc('zelo_of_claim',[owner,'personal']);
  assert.equal(rerun.id,running.id,'an event during a lease requests another pass');
  await rpc('zelo_of_set_status',[owner,'personal',connection.id,'revoking',null]);
  await assert.rejects(rpc('zelo_of_commit_page',[owner,'personal',rerun.id,rerun.lease_token,JSON.stringify({resources:[{...resource,available_amount:'999'}]}),null,'[]']),/OF_CONSENT_INACTIVE/);
  assert.equal(await rpc('zelo_of_claim',[owner,'personal']),null);
  assert.equal((await rpc('zelo_of_overview',[owner,'production','personal'])).resources[0].available_amount,100);
  await db.exec('reset role');
  for(const role of ['anon','authenticated']){
    await db.exec('set role '+role);
    await assert.rejects(rpc('zelo_of_claim',[owner,'personal']),/permission denied/);
    await assert.rejects(db.query('select * from open_finance.sync_jobs'),/permission denied/);
    await db.exec('reset role');
  }
  assert.equal(Number((await db.query('select amount from public.finances')).rows[0].amount),42);
  console.log('Durable sync passed: isolation, lease, redelivery, atomic pages, stale source, cursor cycle and revocation');
}catch(error){console.error(error.message);if(error.detail)console.error(error.detail);if(error.where)console.error(error.where);process.exitCode=1;}finally{await db.close();}
