import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const {PGlite}=await import(pathToFileURL(process.argv[2]).href);
const db=new PGlite();
const sql=p=>readFile(new URL(p,import.meta.url),'utf8');
const a='00000000-0000-4000-8000-000000000001',b='00000000-0000-4000-8000-000000000002';
const rpc=async(name,args=[])=>(await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as value`,args)).rows[0].value;
const owner=async()=>db.exec('reset role');
const service=async()=>db.exec('set role service_role');
const save=(user,mode,n)=>rpc('zelo_of_save_consent',[user,mode,JSON.stringify({id:`10000000-0000-4000-8000-00000000000${n}`,cliente_user_id:user,institution_id:'20000000-0000-4000-8000-000000000001',institution_name:'Test bank',status:'AUTHORISED',products:['ACCOUNT']})]);
const finish=(claim,error=null,status='REVOKED')=>rpc('zelo_of_finish_retirement',[claim.id,claim.retirement_lease_token,error,status]);
try{
  await db.exec(await sql('./open_finance_fixtures.sql'));
  await db.exec("alter table public.users add column status text default 'active'; alter table public.users add column plan text default 'business'; alter table public.users add column email text; create table public.wpp_phone_links(phone text primary key,user_id uuid,access text)");
  for(const name of ['20261009193000_open_finance_storage','20261009213000_open_finance_server_access','20261009220000_open_finance_consents','20261009230000_open_finance_sync_queue','20261009234000_open_finance_report','20261010230000_open_finance_public','20261011030000_open_finance_notifications','20261011090000_open_finance_connection_management'])await db.exec(await sql('../migrations/'+name+'.sql'));
  await service();await rpc('zelo_of_enable_brazil',[a,'personal','BR',true]);await rpc('zelo_of_enable_brazil',[b,'personal','BR',true]);
  const personal=await save(a,'personal',1),business=await save(a,'business',2),oldInactive=await save(b,'personal',3);
  await owner();
  await db.query("insert into open_finance.resources(connection_id,user_id,environment,mode,resource_type,external_id,name) values($1,$2,'production','personal','account','test-account','Test account')",[personal.id,a]);
  await db.query("insert into open_finance.connections(user_id,environment,mode,external_consent_id,institution_id,institution_name,status) values($1,'sandbox','personal','sandbox-consent','test-institution','Sandbox','active')",[a]);
  await db.query("update public.users set status='inactive' where id=$1",[b]);
  await db.exec(await sql('../migrations/20261011093000_open_finance_subscription_retirement.sql'));
  await assert.rejects(db.query('delete from public.users where id=$1',[a]),/OF_CLIENT_HISTORY_PROTECTED/);
  await assert.rejects(db.query('delete from public.users where id=$1',[b]),/OF_CLIENT_HISTORY_PROTECTED/);
  for(const role of ['anon','authenticated']){
    await db.exec('set role '+role);await assert.rejects(rpc('zelo_of_claim_retirement'),/permission denied/);
    await assert.rejects(rpc('zelo_of_finish_retirement',[a,a,null,'REVOKED']),/permission denied/);
    await assert.rejects(db.query('select * from open_finance.retirement_health'),/permission denied/);await owner();
  }
  await service();let claim=await rpc('zelo_of_claim_retirement');assert.equal(claim.id,oldInactive.id,'deployment discovers already inactive customers');
  assert.equal(await rpc('zelo_of_claim_retirement'),null,'paid customers and another worker\'s leased consent are excluded');
  await assert.rejects(rpc('zelo_of_finish_retirement',[claim.id,a,null,'REVOKED']),/OF_LEASE_INVALID/);
  await assert.rejects(finish(claim,null,null),/OF_CANCELLATION_UNCONFIRMED/);
  await assert.rejects(finish(claim,'contains private response'),/OF_ERROR_INVALID/);
  await finish(claim,'POLP_UNAVAILABLE',null);assert.equal(await rpc('zelo_of_claim_retirement'),null,'provider failure uses a durable backoff');
  await owner();
  await assert.rejects(db.query('delete from public.users where id=$1',[a]),/OF_CLIENT_HISTORY_PROTECTED/);
  await db.query('delete from public.users where id=$1',['00000000-0000-4000-8000-000000000003']);
  assert.equal((await db.query('select status from open_finance.connections where id=$1',[claim.id])).rows[0].status,'revoking');
  await db.query('update open_finance.connections set retirement_next_attempt_at=now()-interval \'1 minute\' where id=$1',[claim.id]);
  await service();claim=await rpc('zelo_of_claim_retirement');
  await owner();await db.query("update open_finance.connections set retirement_lease_until=now()-interval '1 second' where id=$1",[claim.id]);await service();
  await assert.rejects(finish(claim),/OF_LEASE_INVALID/);
  const recovered=await rpc('zelo_of_claim_retirement');assert.notEqual(recovered.retirement_lease_token,claim.retirement_lease_token,'a restarted worker recovers an expired lease');
  await owner();await db.query("update public.users set status='active' where id=$1",[b]);await service();await finish(recovered);
  assert.equal((await rpc('zelo_of_connection',[b,'personal',oldInactive.id])).status,'revoked','reactivation never restores a cancelled authorization');
  await owner();await db.query("update public.users set status='inactive' where id=$1",[a]);
  const stopped=(await db.query("select status from open_finance.connections where user_id=$1 and environment='production'",[a])).rows;
  assert.equal(stopped.length,2);assert.ok(stopped.every(c=>c.status==='revoking'),'deactivation stops every PF/PJ import in the same transaction');
  assert.equal((await db.query("select status from open_finance.connections where environment='sandbox'")).rows[0].status,'active');
  await db.query("update public.users set status='active' where id=$1",[a]);await service();
  for(let i=0;i<2;i++){const queued=await rpc('zelo_of_claim_retirement');assert.ok([personal.id,business.id].includes(queued.id));await finish(queued);}
  assert.equal(await rpc('zelo_of_claim_retirement'),null);
  await assert.rejects(save(a,'personal',1),/OF_CONSENT_ALREADY_CLAIMED/);

  // An authorization request already in flight can arrive after the disabling trigger.
  await owner();await db.query("update public.users set status='inactive' where id=$1",[a]);await service();
  const late=await save(a,'personal',4);claim=await rpc('zelo_of_claim_retirement');assert.equal(claim.id,late.id);await finish(claim);
  await owner();await db.query("update public.users set status='active' where id=$1",[a]);await service();
  const manual=await save(a,'personal',5);await rpc('zelo_of_set_status',[a,'personal',manual.id,'revoking',null]);
  claim=await rpc('zelo_of_claim_retirement');await rpc('zelo_of_set_status',[a,'personal',manual.id,'revoked','REVOKED']);await finish(claim,'POLP_UNAVAILABLE',null);
  assert.equal((await rpc('zelo_of_connection',[a,'personal',manual.id])).retirement_error_code,null,'a manual confirmation wins over a worker failure');
  await owner();
  await assert.rejects(db.query('delete from public.users where id=$1',[b]),/OF_CLIENT_HISTORY_PROTECTED/,'confirmed cancellation still preserves the history');
  assert.equal((await db.query("select count(*)::int as n from open_finance.connections where environment='production'")).rows[0].n,5);
  assert.equal((await db.query('select count(*)::int as n from open_finance.resources')).rows[0].n,1);
  assert.equal((await db.query('select count(*)::int as n from public.finances')).rows[0].n,1);
  assert.ok((await db.query("select last_seen_at>now()-interval '1 minute' as alive from open_finance.retirement_health")).rows[0].alive);
  console.log('Retirement: inactive subscriptions, PF/PJ, recovery/backoff, leases, paid-client safety and preserved history passed');
}finally{await db.close();}
