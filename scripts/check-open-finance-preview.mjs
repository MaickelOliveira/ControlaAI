import assert from 'node:assert/strict';
const origin=process.argv[2]||'http://127.0.0.1:3117';
const checks=[['GET','/',307],['GET','/login',200],['GET','/dashboard/contas',307],['GET','/api/admin/accounts',404],['POST','/api/admin/accounts',404],['POST','/api/finances',404],['GET','/api/cron/reminders',404],['POST','/api/webhook/evolution',404],['POST','/api/webhook/waba',404],['POST','/api/auth/register',404],['POST','/dashboard/contas',404]];
for(const [method,path,status]of checks){const response=await fetch(origin+path,{method,redirect:'manual'});assert.equal(response.status,status,`${method} ${path}`);await response.body?.cancel();}
for(const path of ['/api/auth/login','/api/open-finance/login']){
  const response=await fetch(origin+path,{method:'POST',headers:{Origin:'https://untrusted.example','Content-Type':'application/json'},body:JSON.stringify({email:'test@example.test',password:'invalid'}),redirect:'manual'});
  assert.ok([403,404].includes(response.status),'cross-site login must be denied');await response.body?.cancel();
}
console.log('Private preview passed: anonymous gating, legacy writes/webhooks/crons denied and cross-site login rejected');
