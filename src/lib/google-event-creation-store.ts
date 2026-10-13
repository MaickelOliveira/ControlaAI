import "server-only";
import {getSupabase} from "./supabase";
import {getAuthClient} from "./google-oauth";
import {googleBindingFromStorage,type GoogleBinding} from "./google-binding-store";
import {googleOAuthBindingVersion,googleOAuthClientFingerprint} from "./google-oauth-state";
import {loadGoogleEventIntent,reserveGoogleEventIntent,type GoogleEventIntent} from "./google-event-origin-store";
import {googleEventOperationTarget,googleEventRetryIdentity} from "./google-event-policy";
import {googleEventCreationPayload,type GoogleEventCreationPayload} from "./google-event-payload";
import type {GoogleWorkspace} from "./google-workspace-policy";
const STATES=["queued","running","waiting","succeeded","failed"] as const;
const FAILURES=["TEMPORARY","FOREIGN_EVENT","REMOTE_MISSING","CONFERENCE_FAILED","CONNECTION_CHANGED","ATTEMPTS_EXHAUSTED"] as const;
const STORAGE_ERRORS=["GOOGLE_EVENT_INVALID","GOOGLE_EVENT_CONNECTION_CHANGED","GOOGLE_EVENT_ORIGIN_MISSING","GOOGLE_EVENT_PAYLOAD_CONFLICT","GOOGLE_EVENT_ATTEMPT_CONFLICT"];
const SAFE_ERRORS=[...STORAGE_ERRORS,"GOOGLE_EVENT_INPUT_INVALID","GOOGLE_EVENT_NOT_CONNECTED","GOOGLE_EVENT_ACCESS_DENIED","GOOGLE_EVENT_CONFIGURATION_INVALID","GOOGLE_EVENT_STORAGE_INVALID","GOOGLE_EVENT_STORAGE_UNAVAILABLE","GOOGLE_EVENT_PAYLOAD_INVALID"];
export type GoogleEventCreationLease=Readonly<{id:string;expiresAt:string;bindingVersion:string;insertAllowed:boolean}>;
export type GoogleEventCreationOutcome=Readonly<{result:"retry"|"waiting"|"succeeded"|"failed";remoteKnown:boolean;etag:string|null;meetLink:string|null;failureCode:typeof FAILURES[number]|null}>;
export type GoogleEventCreation=Readonly<{intent:GoogleEventIntent;payload:GoogleEventCreationPayload;payloadFingerprint:string;
 state:typeof STATES[number];attemptVersion:string;roundAttempts:number;authorizedBindingVersion:string;lease:GoogleEventCreationLease|null;
 wasAttempted:boolean;remoteKnown:boolean;etag:string|null;meetLink:string|null;failureCode:typeof FAILURES[number]|null}>;
function safe(error:unknown):Error{return Error(error instanceof Error&&SAFE_ERRORS.includes(error.message)?error.message:"GOOGLE_EVENT_FAILED");}
function record(value:unknown):Record<string,unknown>{if(!value||typeof value!=="object"||Array.isArray(value))throw Error();return value as Record<string,unknown>;}
function uuid(value:unknown):string{if(typeof value!=="string"||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value))throw Error();return value.toLowerCase();}
function text(value:unknown):string{if(typeof value!=="string"||!value||value.length>1024||/\p{Cc}/u.test(value))throw Error();return value;}
function meet(value:unknown):string|null{if(value===null)return null;const result=text(value);if(!/^https:\/\/meet[.]google[.]com\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/.test(result))throw Error();return result;}
function revision(value:unknown,positive=false):string{const result=googleOAuthBindingVersion(value);if(positive&&result==="0")throw Error();return result;}
function capture(scope:GoogleWorkspace,eventId:string){
 try{googleEventRetryIdentity(scope,eventId);return {scope:Object.freeze({userId:scope.userId.toLowerCase(),mode:scope.mode,companyId:scope.companyId?.toLowerCase()??null}),eventId:eventId.toLowerCase()};}
 catch{throw Error("GOOGLE_EVENT_INPUT_INVALID");}
}
function args(scope:GoogleWorkspace,eventId:string){return {p_user_id:scope.userId,p_mode:scope.mode,p_company_id:scope.companyId,p_event_id:eventId};}
async function rpc(name:string,params:Record<string,unknown>):Promise<unknown>{
 try{const {data,error}=await getSupabase().rpc(name,params);if(error){if(STORAGE_ERRORS.includes(error.message))throw Error(error.message);throw Error();}return data;}
 catch(error){if(error instanceof Error&&STORAGE_ERRORS.includes(error.message))throw error;throw Error("GOOGLE_EVENT_STORAGE_UNAVAILABLE");}
}
function creation(intent:GoogleEventIntent,value:unknown):GoogleEventCreation{
 try{
  const row=record(value);if(row.event_id!==intent.eventId)throw Error();
  const payload=googleEventCreationPayload(row.payload),payloadFingerprint=row.payload_fingerprint;
  if(typeof payloadFingerprint!=="string"||payloadFingerprint.length!==64||!/^[a-f0-9]{64}$/.test(payloadFingerprint)||row.with_meet!==payload.withMeet)throw Error();
  const state=STATES.find(item=>item===row.state),attemptVersion=revision(row.attempt_version),authorizedBindingVersion=revision(row.authorized_binding_version,true);
  const roundAttempts=row.round_attempts;if(!state||typeof roundAttempts!=="number"||!Number.isInteger(roundAttempts)||roundAttempts<0||roundAttempts>10||BigInt(roundAttempts)>BigInt(attemptVersion))throw Error();
  if(typeof row.was_attempted!=="boolean"||typeof row.remote_known!=="boolean"||(roundAttempts>0&&!row.was_attempted))throw Error();
  let lease:GoogleEventCreationLease|null=null;
  if(state==="running"){
   if(typeof row.lease_until!=="string"||!Number.isFinite(Date.parse(row.lease_until))||typeof row.insert_allowed!=="boolean"||!row.was_attempted)throw Error();
   lease=Object.freeze({id:uuid(row.lease_id),expiresAt:row.lease_until,bindingVersion:revision(row.lease_binding_version,true),insertAllowed:row.insert_allowed});
   if(lease.insertAllowed&&(row.remote_known||lease.bindingVersion!==authorizedBindingVersion))throw Error();
  }else if(row.lease_id!==null||row.lease_until!==null||row.lease_binding_version!==null||row.insert_allowed!==null)throw Error();
  const etag=row.etag===null?null:text(row.etag),meetLink=meet(row.meet_link),failureCode=FAILURES.find(item=>item===row.failure_code)??null;
  if(row.failure_code!==null&&failureCode===null)throw Error();
  if(row.remote_known!==Boolean(etag)||(row.remote_known&&!row.was_attempted)||(meetLink&&(!payload.withMeet||!row.remote_known)))throw Error();
  if((state==="succeeded"&&(!row.remote_known||(payload.withMeet&&!meetLink)))||(state==="waiting"&&(!payload.withMeet||!row.remote_known||meetLink))
   ||(state==="failed"&&!failureCode)||(["running","waiting","succeeded"].includes(state)&&failureCode))throw Error();
  return Object.freeze({intent,payload,payloadFingerprint,state,attemptVersion,roundAttempts,authorizedBindingVersion,lease,wasAttempted:row.was_attempted,remoteKnown:row.remote_known,etag,meetLink,failureCode});
 }catch{throw Error("GOOGLE_EVENT_STORAGE_INVALID");}
}
/** Authenticated scope and authorized local event only. This private payload DTO
 * must never be serialized as a status/UI response; no credential or legacy read. */
export async function loadGoogleEventCreation(scope:GoogleWorkspace,eventId:string):Promise<GoogleEventCreation|null>{
 try{const selected=capture(scope,eventId),intent=await loadGoogleEventIntent(selected.scope,selected.eventId);if(!intent)return null;
  const data=await rpc("zelo_google_event_creation_get",args(selected.scope,selected.eventId));return data===null?null:creation(intent,data);
 }catch(error){throw safe(error);}
}
/** New authorized logical event only; never infer provenance for an old row.
 * Public-record linkage follows before activation. No provider effect here. */
export async function prepareGoogleEventCreation(scope:GoogleWorkspace,eventId:string,input:unknown):Promise<GoogleEventCreation>{
 try{
  const selected=capture(scope,eventId),payload=googleEventCreationPayload(input),client=await getAuthClient();
  if(typeof client._clientId!=="string"||!client._clientId)throw Error("GOOGLE_EVENT_CONFIGURATION_INVALID");const fingerprint=googleOAuthClientFingerprint(client._clientId);
  const intent=await reserveGoogleEventIntent(selected.scope,selected.eventId);
  const saved=creation(intent,await rpc("zelo_google_event_creation_prepare",{...args(selected.scope,selected.eventId),p_client_fingerprint:fingerprint,p_binding_version:intent.bindingVersion,p_payload:payload,p_with_meet:payload.withMeet}));
  if(JSON.stringify(saved.payload)!==JSON.stringify(payload)||saved.authorizedBindingVersion!==intent.bindingVersion)throw Error("GOOGLE_EVENT_STORAGE_INVALID");return saved;
 }catch(error){throw safe(error);}
}
async function mutate(name:"claim"|"finish"|"retry",scope:GoogleWorkspace,eventId:string,binding:GoogleBinding,clientId:string,attemptVersion:string,fields:Record<string,unknown>):Promise<GoogleEventCreation>{
 const selected=capture(scope,eventId);let current:GoogleBinding;let version:string;let fingerprint:string;
 try{
  current=googleBindingFromStorage({id:binding.id,user_id:binding.workspace.userId,mode:binding.workspace.mode,company_id:binding.workspace.companyId,grant_id:binding.grantId,calendar_id:binding.calendarId,calendar_name:binding.calendarName,version:binding.version,unlinked_at:binding.unlinkedAt},selected.scope);
  version=revision(attemptVersion);fingerprint=googleOAuthClientFingerprint(clientId);
 }catch{throw Error("GOOGLE_EVENT_INPUT_INVALID");}
 const intent=await loadGoogleEventIntent(selected.scope,selected.eventId);if(!intent)throw Error("GOOGLE_EVENT_ORIGIN_MISSING");
 googleEventOperationTarget(selected.scope,selected.eventId,intent,current);
 return creation(intent,await rpc("zelo_google_event_creation_"+name,{...args(selected.scope,selected.eventId),p_client_fingerprint:fingerprint,p_binding_version:current.version,p_attempt_version:version,...fields}));
}
/** Call within the trusted scoped runtime after credentials are ready. Binding
 * and client ID must be the runtime's captured metadata, never a body/model. */
export async function claimGoogleEventCreation(scope:GoogleWorkspace,eventId:string,binding:GoogleBinding,clientId:string,attemptVersion:string):Promise<GoogleEventCreation>{
 try{const version=revision(attemptVersion),bindingVersion=revision(binding.version,true);
  const saved=await mutate("claim",scope,eventId,binding,clientId,version,{});
  if(saved.state!=="running"||!saved.lease||saved.roundAttempts<1||saved.lease.bindingVersion!==bindingVersion||BigInt(saved.attemptVersion)!==BigInt(version)+BigInt(1))throw Error("GOOGLE_EVENT_STORAGE_INVALID");return saved;
 }catch(error){throw safe(error);}
}
/** Explicit authenticated user retry of the same original target, no silent CAS
 * retry or lease adoption. The database retains attempted/known history. */
export async function retryGoogleEventCreation(scope:GoogleWorkspace,eventId:string,binding:GoogleBinding,clientId:string,attemptVersion:string):Promise<GoogleEventCreation>{
 try{const version=revision(attemptVersion),bindingVersion=revision(binding.version,true);
  const saved=await mutate("retry",scope,eventId,binding,clientId,version,{});
  if(saved.state!=="queued"||saved.roundAttempts!==0||saved.authorizedBindingVersion!==bindingVersion||BigInt(saved.attemptVersion)!==BigInt(version)+BigInt(1))throw Error("GOOGLE_EVENT_STORAGE_INVALID");return saved;
 }catch(error){throw safe(error);}
}
/** Only the server's verified provider result may complete its captured lease.
 * All nullable fields are explicit; raw diagnostics are refused before storage. */
export async function finishGoogleEventCreation(scope:GoogleWorkspace,eventId:string,binding:GoogleBinding,clientId:string,attemptVersion:string,lease:GoogleEventCreationLease,outcome:GoogleEventCreationOutcome):Promise<GoogleEventCreation>{
 try{
  const version=revision(attemptVersion);let fields:Record<string,unknown>;
  try{
   const value=record(outcome);
   if(Object.keys(value).some(key=>!["result","remoteKnown","etag","meetLink","failureCode"].includes(key))||typeof value.result!=="string"||!["retry","waiting","succeeded","failed"].includes(value.result)||typeof value.remoteKnown!=="boolean"
    ||(value.failureCode!==null&&!FAILURES.some(code=>code===value.failureCode)))throw Error();
   fields={p_lease_id:uuid(lease.id),p_result:value.result,p_remote_known:value.remoteKnown,p_etag:value.etag===null?null:text(value.etag),p_meet_link:meet(value.meetLink),p_failure_code:value.failureCode};
   if(revision(lease.bindingVersion,true)!==revision(binding.version,true))throw Error("GOOGLE_EVENT_ATTEMPT_CONFLICT");
  }catch(error){if(error instanceof Error&&error.message==="GOOGLE_EVENT_ATTEMPT_CONFLICT")throw error;throw Error("GOOGLE_EVENT_INPUT_INVALID");}
  const saved=await mutate("finish",scope,eventId,binding,clientId,version,fields);
  const result=fields.p_result,exhausted=(result==="retry"||result==="waiting")&&saved.roundAttempts===10;
  const expected=exhausted?"failed":result==="retry"?"queued":result,expectedFailure=exhausted?"ATTEMPTS_EXHAUSTED":fields.p_failure_code;
  if(saved.attemptVersion!==version||saved.lease!==null||saved.state!==expected||saved.failureCode!==expectedFailure||!saved.wasAttempted||saved.roundAttempts<1||(fields.p_remote_known&&!saved.remoteKnown)
   ||(fields.p_etag!==null&&saved.etag!==fields.p_etag)||saved.meetLink!==fields.p_meet_link)throw Error("GOOGLE_EVENT_STORAGE_INVALID");return saved;
 }catch(error){throw safe(error);}
}
