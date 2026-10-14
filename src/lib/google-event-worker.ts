import "server-only";
import {runWithTrustedCompanyJob} from "./company-context";
import {pumpGoogleWorkspaceEvents,type GoogleEventRecoveryCounts} from "./google-event-recovery";
const KEY=Symbol.for("zelo.googleEventWorker"),IDLE=[60000,120000,240000,300000] as const;
type State={started:boolean;running:boolean;timer:ReturnType<typeof setTimeout>|null;urgent:boolean;wakeNext:boolean;idleStep:number};
const registry=process as typeof process&{[KEY]?:State};
function schedule(state:State,delay:number,urgent=false):void{
 if(state.timer!==null)clearTimeout(state.timer);
 state.urgent=urgent;
 state.timer=setTimeout(()=>{state.timer=null;state.urgent=false;void tick(state);},delay);
 state.timer.unref();
}
function valid(counts:GoogleEventRecoveryCounts):boolean{
 return counts!==null&&typeof counts==="object"&&[counts.selected,counts.completed,counts.deferred].every(value=>typeof value==="number"&&Number.isInteger(value)&&value>=0&&value<=20)&&counts.completed+counts.deferred===counts.selected;
}
async function tick(state:State):Promise<void>{
 if(state.running){state.wakeNext=true;return;}
 state.running=true;let hasWork=false;
 try{
  // Clear inherited request scope only. The private SQL selector supplies every
  // original job scope; its worker rechecks current binding/head/access/lease.
  const counts=await runWithTrustedCompanyJob(pumpGoogleWorkspaceEvents);
  if(!valid(counts))throw Error();hasWork=counts.selected>0;
 }catch{console.error("[google-events] Recuperação adiada");}
 finally{
  state.running=false;
  if(state.wakeNext){state.wakeNext=false;state.idleStep=0;schedule(state,0,true);}
  else if(hasWork){state.idleStep=0;schedule(state,30000);}
  else{const delay=IDLE[state.idleStep];state.idleStep=Math.min(state.idleStep+1,IDLE.length-1);schedule(state,delay);}
 }
}
/** Node bootstrap only; one process timer/pump even across module reloading.
 * Database leases separately coordinate workers in distinct server processes. */
export function startGoogleEventWorker():void{
 const state=registry[KEY]??(registry[KEY]={started:false,running:false,timer:null,urgent:false,wakeNext:false,idleStep:0});
 if(state.started)return;state.started=true;schedule(state,15000);
}
/** Hint after a persisted intention, never a job/owner/provenance input. Only
 * Node bootstrap starts the worker. Multiple hints coalesce without overlap. */
export function wakeGoogleEventWorker():void{
 const state=registry[KEY];if(!state?.started)return;
 if(state.running){state.wakeNext=true;return;}
 state.idleStep=0;if(!state.urgent)schedule(state,0,true);
}
