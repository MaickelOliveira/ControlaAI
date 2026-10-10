import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
if(process.env.OPEN_FINANCE_PREVIEW_ONLY!=='true')throw new Error('Preview isolation required');
if((process.env.JWT_SECRET?.length??0)<32||(process.env.OPEN_FINANCE_SYNC_CRON_SECRET?.length??0)<32)throw new Error('Private preview secrets missing');
const server=spawn(process.execPath,['server.js'],{stdio:'inherit'}),controller=new AbortController();
let stopping=false;
function stop(signal='SIGTERM'){if(stopping)return;stopping=true;controller.abort();server.kill(signal);}
process.on('SIGTERM',()=>stop());process.on('SIGINT',()=>stop('SIGINT'));
server.on('error',()=>{controller.abort();process.exitCode=1;});
server.on('exit',code=>{controller.abort();if(!stopping)process.exitCode=code||1;});
const mode=process.env.OPEN_FINANCE_PREVIEW_MODE==='business'?'business':'personal';
const modes=process.env.OPEN_FINANCE_PREVIEW_BUSINESS_ENABLED==='true'?['personal','business']:[mode];
let modeIndex=0;
let lastFailure=false;
while(!controller.signal.aborted) {
  try{
    // One bounded page at a time. DB leases and rate gate cover process restarts.
    if(process.env.OPEN_FINANCE_SYNC_ENABLED==='true') {
      // Advance before the request: an error in either scope cannot starve the other.
      const selectedMode=modes[modeIndex++%modes.length];
      const url=`http://127.0.0.1:${process.env.PORT||80}/api/cron/open-finance?mode=${selectedMode}`;
      const response=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${process.env.OPEN_FINANCE_SYNC_CRON_SECRET}`},signal:AbortSignal.any([controller.signal,AbortSignal.timeout(45000)]),redirect:'error'});
      await response.body?.cancel();
      if(!response.ok&& !lastFailure)console.error('Open Finance worker awaiting configuration or retry');
      lastFailure=!response.ok;
    }
    await delay(lastFailure?30000:1100,undefined,{signal:controller.signal});
  }catch{if(controller.signal.aborted)break;await delay(10000,undefined,{signal:controller.signal}).catch(()=>{});}
}
