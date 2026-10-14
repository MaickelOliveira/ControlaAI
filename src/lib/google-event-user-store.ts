import "server-only";
import {googleEventChangePayload,type GoogleEventChangePayload} from "./google-event-command-policy";
import type {GoogleLocalAttendee} from "./google-event-local-store";
import {getSupabase} from "./supabase";
import {getAuthClient} from "./google-oauth";
import {loadGoogleBinding} from "./google-binding-store";
import {loadGoogleEventCreation} from "./google-event-creation-store";
import {googleEventOperationTarget} from "./google-event-policy";
import {googleOAuthBindingVersion,googleOAuthClientFingerprint} from "./google-oauth-state";
import {googleWorkspaceKey,type GoogleWorkspace} from "./google-workspace-policy";
import {googleEventCreationPayload,type GoogleEventCreationPayload} from "./google-event-payload";
export type GoogleEventExpectation=Readonly<{clientMutationId:string;expectedGoogleSyncVersion:string|null}>;
export type GoogleEventUserRetry=Readonly<{eventId:string;operationId:string|null}>;
export type GoogleAppointmentLocalMetadata=Readonly<{status?:"scheduled"|"done"|"cancelled";ata_generated?:boolean;ata_content?:string|null;ata_notified_at?:string|null;reminder_sent_at?:string|null;reminder_15min_sent_at?:string|null}>;
const SAFE=["GOOGLE_EVENT_INVALID","GOOGLE_EVENT_COMMAND_CONFLICT","GOOGLE_EVENT_NOT_FOUND","GOOGLE_EVENT_ORIGIN_MISSING","GOOGLE_EVENT_LOCAL_CONFLICT","GOOGLE_EVENT_LOCAL_INACTIVE","GOOGLE_EVENT_ATTEMPT_CONFLICT","GOOGLE_EVENT_CONNECTION_CHANGED","GOOGLE_WORKSPACE_ACCESS_DENIED"];
function object(value:unknown,keys:readonly string[]):Record<string,unknown>{if(!value||typeof value!=="object"||Array.isArray(value))throw Error();const row=value as Record<string,unknown>;if(Object.keys(row).some(key=>!keys.includes(key)))throw Error();return row;}
function uuid(value:unknown):string{if(typeof value!=="string"||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value))throw Error();return value.toLowerCase();}
export function googleEventSyncVersion(value:unknown):readonly [string,string,string]{
 try{if(typeof value!=="string"||!/^v1:(?:0|[1-9]\d*):(?:0|[1-9]\d*):(?:0|[1-9]\d*)$/.test(value))throw Error();const parts=value.split(":").slice(1).map(googleOAuthBindingVersion);return Object.freeze([parts[0],parts[1],parts[2]]);}
 catch{throw Error("GOOGLE_EVENT_INPUT_INVALID");}
}
export function googleEventExpectation(value:unknown,local=true):GoogleEventExpectation{
 try{const row=object(value,["clientMutationId","expectedGoogleSyncVersion"]),id=uuid(row.clientMutationId);if(row.expectedGoogleSyncVersion!==null)googleEventSyncVersion(row.expectedGoogleSyncVersion);else if(!local)throw Error();return Object.freeze({clientMutationId:id,expectedGoogleSyncVersion:row.expectedGoogleSyncVersion as string|null});}
 catch{throw Error("GOOGLE_EVENT_INPUT_INVALID");}
}
function capture(scope:GoogleWorkspace,eventId:string,value:GoogleEventExpectation,local=true){
 try{object(scope,["userId","mode","companyId"]);googleWorkspaceKey(scope);return Object.freeze({scope:Object.freeze({userId:scope.userId.toLowerCase(),mode:scope.mode,companyId:scope.companyId?.toLowerCase()??null}),eventId:uuid(eventId),expectation:googleEventExpectation(value,local)});}
 catch{throw Error("GOOGLE_EVENT_INPUT_INVALID");}
}
function args(selected:ReturnType<typeof capture>){return {p_user_id:selected.scope.userId,p_mode:selected.scope.mode,p_company_id:selected.scope.companyId,p_event_id:selected.eventId,p_mutation_id:selected.expectation.clientMutationId,p_expected_sync_version:selected.expectation.expectedGoogleSyncVersion};}
async function rpc(name:string,params:Record<string,unknown>):Promise<unknown>{
 try{const {data,error}=await getSupabase().rpc(name,params);if(error){if(SAFE.includes(error.message))throw Error(error.message);throw Error();}return data;}
 catch(error){throw Error(error instanceof Error&&SAFE.includes(error.message)?error.message:"GOOGLE_EVENT_STORAGE_UNAVAILABLE");}
}
function ref(eventId:string,value:unknown):GoogleEventUserRetry{
 try{const row=object(value,["event_id","operation_id"]);if(row.event_id!==eventId)throw Error();return Object.freeze({eventId,operationId:row.operation_id===null?null:uuid(row.operation_id)});}
 catch{throw Error("GOOGLE_EVENT_STORAGE_INVALID");}
}
async function retryReceipt(selected:ReturnType<typeof capture>):Promise<GoogleEventUserRetry|null>{const data=await rpc("zelo_google_event_user_retry_get",args(selected));return data===null?null:ref(selected.eventId,data);}
/** Original confirmed retry receipt only; no configuration/provider authority. */
export async function loadGoogleEventUserRetry(scope:GoogleWorkspace,eventId:string,expectation:GoogleEventExpectation):Promise<GoogleEventUserRetry|null>{return await retryReceipt(capture(scope,eventId,expectation,false));}
/** Stable UUID plus original full snapshot revision. The SQL wrapper advances
 * exactly one original round atomically; response-loss replay resets nothing. */
export async function retryGoogleEventUserIntent(scope:GoogleWorkspace,eventId:string,expectation:GoogleEventExpectation):Promise<GoogleEventUserRetry&Readonly<{replayed:boolean}>>{
 const selected=capture(scope,eventId,expectation,false),existing=await retryReceipt(selected);if(existing)return Object.freeze({...existing,replayed:true});
 const creation=await loadGoogleEventCreation(selected.scope,selected.eventId);if(!creation)throw Error("GOOGLE_EVENT_NOT_FOUND");
 const binding=await loadGoogleBinding(selected.scope);try{googleEventOperationTarget(selected.scope,selected.eventId,creation.intent,binding);}catch{throw Error("GOOGLE_EVENT_NOT_CONNECTED");}
 let fingerprint:string;try{const auth=await getAuthClient();if(typeof auth._clientId!=="string")throw Error();fingerprint=googleOAuthClientFingerprint(auth._clientId);}catch{throw Error("GOOGLE_EVENT_CONFIGURATION_INVALID");}
 const saved=ref(selected.eventId,await rpc("zelo_google_event_user_retry",{...args(selected),p_client_fingerprint:fingerprint,p_binding_version:binding!.version}));return Object.freeze({...saved,replayed:false});
}
function metadata(value:unknown):GoogleAppointmentLocalMetadata{
 const row=object(value,["status","ata_generated","ata_content","ata_notified_at","reminder_sent_at","reminder_15min_sent_at"]);const result:Record<string,unknown>={};
 for(const [key,entry] of Object.entries(row)){
  if(key==="status"){if(entry!=="scheduled"&&entry!=="done"&&entry!=="cancelled")throw Error();result[key]=entry;}
  else if(key==="ata_generated"){if(typeof entry!=="boolean")throw Error();result[key]=entry;}
  else if(key==="ata_content"){if(entry!==null&&(typeof entry!=="string"||entry.length>65536))throw Error();result[key]=entry;}
  else {if(entry!==null&&(typeof entry!=="string"||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(entry)||!Number.isFinite(Date.parse(entry))))throw Error();result[key]=entry;}
 }
 return Object.freeze(result);
}
/** Exact visible local row; pure minutes/reminders/status never enter Google.
 * Controlled payload/cancellation is permitted only without a private origin. */
export async function patchGoogleAppointmentLocal(scope:GoogleWorkspace,eventId:string,expectation:GoogleEventExpectation,value:GoogleEventCreationPayload|null,patch:GoogleAppointmentLocalMetadata):Promise<void>{
 const selected=capture(scope,eventId,expectation);let payload:GoogleEventCreationPayload|null,fields:GoogleAppointmentLocalMetadata;
 try{payload=value===null?null:googleEventCreationPayload(value);if(payload?.withMeet)throw Error();fields=metadata(patch);}catch{throw Error("GOOGLE_EVENT_INPUT_INVALID");}
 if(await rpc("zelo_google_appointment_local_patch",{...args(selected),p_payload:payload,p_patch:fields})!==true)throw Error("GOOGLE_EVENT_STORAGE_INVALID");
}

export type GoogleEventControlledSnapshot=Readonly<{kind:"appointment"|"meet";payload:GoogleEventChangePayload;attendees:readonly GoogleLocalAttendee[]}>;
/** Private controlled values/desired guests from one exact confirmed snapshot.
 * This is server input for a later guarded command, never provider authority. */
export async function loadGoogleEventControlledSnapshot(scope:GoogleWorkspace,eventId:string,expectation:GoogleEventExpectation):Promise<GoogleEventControlledSnapshot>{
 const selected=capture(scope,eventId,expectation,false);
 const data=await rpc("zelo_google_event_controlled_snapshot",{p_user_id:selected.scope.userId,p_mode:selected.scope.mode,p_company_id:selected.scope.companyId,p_event_id:selected.eventId,p_expected_sync_version:selected.expectation.expectedGoogleSyncVersion});
 try{
  const row=object(data,["kind","payload","local_attendees"]);if(row.kind!=="appointment"&&row.kind!=="meet"||!Array.isArray(row.local_attendees)||row.local_attendees.length>100)throw Error();
  const payload=googleEventChangePayload(row.payload),attendees=Object.freeze(row.local_attendees.map(value=>{const entry=object(value,["name","phone","email"]);
   if(typeof entry.name!=="string"||entry.name.length>256||/\p{Cc}/u.test(entry.name))throw Error();
   for(const key of ["phone","email"])if(entry[key]!==undefined&&(typeof entry[key]!=="string"||(entry[key] as string).length>(key==="phone"?64:254)||/\p{Cc}/u.test(entry[key] as string)))throw Error();
   return Object.freeze({name:entry.name,...(entry.phone===undefined?{}:{phone:entry.phone as string}),...(entry.email===undefined?{}:{email:entry.email as string})});
  }));
  if(row.kind==="appointment"&&attendees.length)throw Error();
  if(row.kind==="meet"){
   if(payload.allDay||payload.repeat!=="none")throw Error();
   const guests=googleEventCreationPayload({...payload,withMeet:true,attendees:attendees.filter(entry=>entry.email!==undefined).map(entry=>({email:entry.email,displayName:entry.name}))});
   if(JSON.stringify(guests.attendees)!==JSON.stringify(payload.attendees))throw Error();
  }
  return Object.freeze({kind:row.kind,payload,attendees});
 }catch{throw Error("GOOGLE_EVENT_STORAGE_INVALID");}
}
