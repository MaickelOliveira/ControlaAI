import "server-only";
import {getSupabase} from "./supabase";
import {googleWorkspaceKey,type GoogleWorkspace} from "./google-workspace-policy";
import {synchronizeGoogleEventCreation} from "./google-event-creation-sync";
import {synchronizeGoogleEventCommand} from "./google-event-command-sync";
type Job=Readonly<{scope:GoogleWorkspace;eventId:string;operationId:string|null}>;
export type GoogleEventRecoveryCounts=Readonly<{selected:number;completed:number;deferred:number}>;
function uuid(value:unknown):string{if(typeof value!=="string"||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value))throw Error();return value.toLowerCase();}
async function jobs():Promise<readonly Job[]>{
 let data:unknown;
 try{const result=await getSupabase().rpc("zelo_google_event_pending",{p_limit:20});if(result.error)throw Error();data=result.data;}
 catch{throw Error("GOOGLE_EVENT_RECOVERY_UNAVAILABLE");}
 try{
  if(!Array.isArray(data)||data.length>20)throw Error();const seen=new Set<string>();
  return Object.freeze(data.map(value=>{
   if(!value||typeof value!=="object"||Array.isArray(value))throw Error();const row=value as Record<string,unknown>;
   if(Object.keys(row).length!==5||Object.keys(row).some(key=>!["user_id","mode","company_id","event_id","operation_id"].includes(key))||(row.mode!=="personal"&&row.mode!=="business"))throw Error();
   const scope=Object.freeze({userId:uuid(row.user_id),mode:row.mode,companyId:row.company_id===null?null:uuid(row.company_id)});googleWorkspaceKey(scope);
   const eventId=uuid(row.event_id),operationId=row.operation_id===null?null:uuid(row.operation_id);if(seen.has(eventId))throw Error();seen.add(eventId);
   return Object.freeze({scope,eventId,operationId});
  }));
 }catch{throw Error("GOOGLE_EVENT_RECOVERY_STORAGE_INVALID");}
}
/** Only the private selector supplies original authenticated job references.
 * Validate the entire batch before effects; SDK workers recheck current access,
 * local/head/binding/lease. No new identity, global fallback or entity diagnostics. */
export async function pumpGoogleWorkspaceEvents():Promise<GoogleEventRecoveryCounts>{
 const selected=await jobs();let next=0,completed=0,deferred=0;
 const process=async()=>{
  while(next<selected.length){const job=selected[next++];
   try{
    const result=job.operationId===null?await synchronizeGoogleEventCreation(job.scope,job.eventId):await synchronizeGoogleEventCommand(job.scope,job.eventId,job.operationId);
    if(result.state==="succeeded")completed++;else deferred++;
   }catch{deferred++;}
  }
 };
 await Promise.all(Array.from({length:Math.min(3,selected.length)},()=>process()));
 return Object.freeze({selected:selected.length,completed,deferred});
}
