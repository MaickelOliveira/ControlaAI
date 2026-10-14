import "server-only";
import {getSupabase} from "./supabase";
import {getAuthClient} from "./google-oauth";
import {googleBindingFromStorage,loadGoogleBinding,type GoogleBinding} from "./google-binding-store";
import {loadGoogleEventCreation} from "./google-event-creation-store";
import type {GoogleEventIntent} from "./google-event-origin-store";
import {googleOAuthBindingVersion,googleOAuthClientFingerprint} from "./google-oauth-state";
import {googleEventOperationTarget,googleEventRetryIdentity} from "./google-event-policy";
import {googleEventChangePayload,googleEventCommandIdentity,type GoogleEventChangePayload,type GoogleEventCommandKind} from "./google-event-command-policy";
import type {GoogleLocalAttendee} from "./google-event-local-store";
import type {GoogleWorkspace} from "./google-workspace-policy";
const STATES=["queued","running","waiting","succeeded","failed"] as const;
const FAILURES=["TEMPORARY","FOREIGN_EVENT","REMOTE_MISSING","CONFERENCE_FAILED","CONNECTION_CHANGED","ATTEMPTS_EXHAUSTED","ETAG_CONFLICT","SUPERSEDED"] as const;
const STORAGE_ERRORS=["GOOGLE_EVENT_INVALID","GOOGLE_EVENT_COMMAND_CONFLICT","GOOGLE_EVENT_CONNECTION_CHANGED","GOOGLE_EVENT_ORIGIN_MISSING","GOOGLE_EVENT_LOCAL_INACTIVE","GOOGLE_EVENT_LOCAL_CONFLICT","GOOGLE_EVENT_ATTEMPT_CONFLICT"];
const SAFE_ERRORS=[...STORAGE_ERRORS,"GOOGLE_EVENT_COMMAND_INVALID","GOOGLE_EVENT_STORAGE_INVALID","GOOGLE_EVENT_STORAGE_UNAVAILABLE","GOOGLE_EVENT_NOT_CONNECTED","GOOGLE_EVENT_CONFIGURATION_INVALID","GOOGLE_EVENT_ACCESS_DENIED"];
export type GoogleEventCommandHead=Readonly<{eventId:string;version:string;operationId:string|null;etag:string;deleted:boolean}>;
export type GoogleEventCommandLease=Readonly<{id:string;expiresAt:string;bindingVersion:string;mutationAllowed:boolean}>;
export type GoogleEventCommandOutcome=Readonly<{result:"retry"|"waiting"|"succeeded"|"failed";etag:string|null;meetLink:string|null;failureCode:typeof FAILURES[number]|null}>;
export type GoogleEventCommand=Readonly<{intent:GoogleEventIntent;creationFingerprint:string;creationWithMeet:boolean;operationId:string;headVersion:string;kind:GoogleEventCommandKind;
 payload:GoogleEventChangePayload|null;localAttendees:readonly GoogleLocalAttendee[]|null;payloadFingerprint:string;expectedEtag:string;conferenceRequestId:string|null;
 authorizedBindingVersion:string;state:typeof STATES[number];attemptVersion:string;roundAttempts:number;lease:GoogleEventCommandLease|null;
 wasAttempted:boolean;etag:string|null;meetLink:string|null;failureCode:typeof FAILURES[number]|null}>;
function safe(error:unknown):Error{return Error(error instanceof Error&&SAFE_ERRORS.includes(error.message)?error.message:"GOOGLE_EVENT_FAILED");}
function object(value:unknown):Record<string,unknown>{if(!value||typeof value!=="object"||Array.isArray(value))throw Error();return value as Record<string,unknown>;}
function uuid(value:unknown):string{if(typeof value!=="string"||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value))throw Error();return value.toLowerCase();}
function text(value:unknown,max=1024):string{if(typeof value!=="string"||!value||value.length>max||/\p{Cc}/u.test(value))throw Error();return value;}
function hex(value:unknown):string{if(typeof value!=="string"||!/^[a-f0-9]{64}$/.test(value))throw Error();return value;}
function version(value:unknown,positive=false):string{const result=googleOAuthBindingVersion(value);if(positive&&result==="0")throw Error();return result;}
function link(value:unknown):string|null{if(value===null)return null;const result=text(value);if(!/^https:\/\/meet[.]google[.]com\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/.test(result))throw Error();return result;}
function localAttendees(value:unknown):readonly GoogleLocalAttendee[]{
 if(!Array.isArray(value)||value.length>100)throw Error();const result=Object.freeze(value.map(entry=>{
  const row=object(entry);if(Object.keys(row).some(key=>!["name","phone","email"].includes(key))||typeof row.name!=="string"||row.name.length>256||/\p{Cc}/u.test(row.name))throw Error();
  return Object.freeze({name:row.name,...(row.phone===undefined?{}:{phone:text(row.phone,64)}),...(row.email===undefined?{}:{email:text(row.email,254)})});
 }));if(Buffer.byteLength(JSON.stringify(result),"utf8")>8000)throw Error();return result;
}
function capture(scope:GoogleWorkspace,eventId:string,operationId?:string){
 try{googleEventRetryIdentity(scope,eventId);return {scope:Object.freeze({userId:scope.userId.toLowerCase(),mode:scope.mode,companyId:scope.companyId?.toLowerCase()??null}),eventId:uuid(eventId),...(operationId===undefined?{}:{operationId:uuid(operationId)})};}
 catch{throw Error("GOOGLE_EVENT_COMMAND_INVALID");}
}
function args(scope:GoogleWorkspace,eventId:string,operationId?:string){return {p_user_id:scope.userId,p_mode:scope.mode,p_company_id:scope.companyId,p_event_id:eventId,...(operationId===undefined?{}:{p_operation_id:operationId})};}
async function rpc(name:string,params:Record<string,unknown>):Promise<unknown>{
 try{const {data,error}=await getSupabase().rpc("zelo_google_event_command_"+name,params);if(error){if(STORAGE_ERRORS.includes(error.message))throw Error(error.message);throw Error();}return data;}
 catch(error){if(error instanceof Error&&STORAGE_ERRORS.includes(error.message))throw error;throw Error("GOOGLE_EVENT_STORAGE_UNAVAILABLE");}
}
function input(value:unknown){
 try{const row=object(value);if(row.kind!=="update"&&row.kind!=="delete"&&row.kind!=="conference")throw Error();
  if(row.kind==="update"){
   if(Object.keys(row).some(key=>!["kind","payload","attendees"].includes(key)))throw Error();
   return Object.freeze({kind:row.kind,payload:googleEventChangePayload(row.payload),attendees:localAttendees(row.attendees)});
  }
  if(Object.keys(row).some(key=>key!=="kind"))throw Error();return Object.freeze({kind:row.kind,payload:null,attendees:null});
 }catch{throw Error("GOOGLE_EVENT_COMMAND_INVALID");}
}
function command(intent:GoogleEventIntent,creationFingerprint:string,creationWithMeet:boolean,operationId:string,value:unknown):GoogleEventCommand{
 try{
  const row=object(value);if(row.event_id!==intent.eventId||row.operation_id!==operationId||typeof creationWithMeet!=="boolean")throw Error();hex(creationFingerprint);
  const kind=row.kind;if(kind!=="update"&&kind!=="delete"&&kind!=="conference")throw Error();
  const headVersion=version(row.head_version,true),payload=kind==="update"?googleEventChangePayload(row.payload):null,attendees=kind==="update"?localAttendees(row.local_attendees):null;
  if(kind!=="update"&&(row.payload!==null||row.local_attendees!==null))throw Error();
  const conferenceRequestId=kind==="conference"?googleEventCommandIdentity(intent.workspace,intent.eventId,operationId):null;if(row.conference_request_id!==conferenceRequestId)throw Error();
  const payloadFingerprint=hex(row.payload_fingerprint),expectedEtag=text(row.expected_etag),authorizedBindingVersion=version(row.authorized_binding_version,true),attemptVersion=version(row.attempt_version);
  const state=STATES.find(item=>item===row.state),roundAttempts=row.round_attempts;
  if(!state||typeof roundAttempts!=="number"||!Number.isInteger(roundAttempts)||roundAttempts<0||roundAttempts>10||BigInt(roundAttempts)>BigInt(attemptVersion)
   ||typeof row.was_attempted!=="boolean"||(roundAttempts>0&&!row.was_attempted))throw Error();
  let lease:GoogleEventCommandLease|null=null;
  if(state==="running"){
   if(typeof row.lease_until!=="string"||!Number.isFinite(Date.parse(row.lease_until))||typeof row.mutation_allowed!=="boolean"||!row.was_attempted||roundAttempts<1)throw Error();
   lease=Object.freeze({id:uuid(row.lease_id),expiresAt:row.lease_until,bindingVersion:version(row.lease_binding_version,true),mutationAllowed:row.mutation_allowed});
   if(lease.mutationAllowed&&lease.bindingVersion!==authorizedBindingVersion)throw Error();
  }else if(row.lease_id!==null||row.lease_until!==null||row.lease_binding_version!==null||row.mutation_allowed!==null)throw Error();
  const etag=row.etag===null?null:text(row.etag),meetLink=link(row.meet_link),failureCode=FAILURES.find(code=>code===row.failure_code)??null;
  if(row.failure_code!==null&&failureCode===null||meetLink&&(kind!=="conference"||!etag)||(state==="failed"&&!failureCode)||(["running","waiting","succeeded"].includes(state)&&failureCode)
   ||(state==="succeeded"&&kind!=="delete"&&(!etag||kind==="conference"&&!meetLink))||(state==="waiting"&&(kind!=="conference"||!etag||meetLink)))throw Error();
  return Object.freeze({intent,creationFingerprint,creationWithMeet,operationId,headVersion,kind,payload,localAttendees:attendees,payloadFingerprint,expectedEtag,conferenceRequestId,authorizedBindingVersion,state,attemptVersion,roundAttempts,lease,wasAttempted:row.was_attempted,etag,meetLink,failureCode});
 }catch{throw Error("GOOGLE_EVENT_STORAGE_INVALID");}
}
async function read(scope:GoogleWorkspace,eventId:string,operationId:string):Promise<GoogleEventCommand|null>{
 const creation=await loadGoogleEventCreation(scope,eventId);if(!creation)return null;
 const data=await rpc("get",args(scope,eventId,operationId));return data===null?null:command(creation.intent,creation.payloadFingerprint,creation.payload.withMeet,operationId,data);
}
/** Private history only. Scope/event come from authenticated local authorization. */
export async function loadGoogleEventCommandHead(scope:GoogleWorkspace,eventId:string):Promise<GoogleEventCommandHead|null>{
 try{const selected=capture(scope,eventId),data=await rpc("head",args(selected.scope,selected.eventId));if(data===null)return null;
  try{const row=object(data),revision=version(row.head_version),operationId=row.operation_id===null?null:uuid(row.operation_id);
   if(row.event_id!==selected.eventId||typeof row.deleted!=="boolean"||(revision==="0")!==(operationId===null))throw Error();
   return Object.freeze({eventId:selected.eventId,version:revision,operationId,etag:text(row.etag),deleted:row.deleted});
  }catch{throw Error("GOOGLE_EVENT_STORAGE_INVALID");}
 }catch(error){throw safe(error);}
}
export async function loadGoogleEventCommand(scope:GoogleWorkspace,eventId:string,operationId:string):Promise<GoogleEventCommand|null>{
 try{const selected=capture(scope,eventId,operationId);return await read(selected.scope,selected.eventId,selected.operationId!);}catch(error){throw safe(error);}
}
/** Explicit authorized action only; immutable command and desired linked local
 * fields commit before any provider mutation. A stale head is never adopted. */
export async function prepareGoogleEventCommand(scope:GoogleWorkspace,eventId:string,operationId:string,headVersion:string,value:unknown):Promise<GoogleEventCommand>{
 try{
  const selected=capture(scope,eventId,operationId),normalized=input(value),revision=version(headVersion);
  const creation=await loadGoogleEventCreation(selected.scope,selected.eventId);if(!creation)throw Error("GOOGLE_EVENT_ORIGIN_MISSING");
  const client=await getAuthClient();if(typeof client._clientId!=="string")throw Error("GOOGLE_EVENT_CONFIGURATION_INVALID");const fingerprint=googleOAuthClientFingerprint(client._clientId),binding=await loadGoogleBinding(selected.scope);
  if(!binding||binding.unlinkedAt!==null)throw Error("GOOGLE_EVENT_NOT_CONNECTED");googleEventOperationTarget(selected.scope,selected.eventId,creation.intent,binding);
  const saved=command(creation.intent,creation.payloadFingerprint,creation.payload.withMeet,selected.operationId!,await rpc("prepare",{...args(selected.scope,selected.eventId,selected.operationId),p_head_version:revision,p_client_fingerprint:fingerprint,p_binding_version:binding.version,p_kind:normalized.kind,p_payload:normalized.payload,p_local_attendees:normalized.attendees}));
  if(BigInt(saved.headVersion)!==BigInt(revision)+BigInt(1)||saved.kind!==normalized.kind||JSON.stringify(saved.payload)!==JSON.stringify(normalized.payload)||JSON.stringify(saved.localAttendees)!==JSON.stringify(normalized.attendees))throw Error("GOOGLE_EVENT_STORAGE_INVALID");return saved;
 }catch(error){throw safe(error);}
}
function runtime(scope:GoogleWorkspace,binding:GoogleBinding,clientId:string){
 try{const current=googleBindingFromStorage({id:binding.id,user_id:binding.workspace.userId,mode:binding.workspace.mode,company_id:binding.workspace.companyId,grant_id:binding.grantId,calendar_id:binding.calendarId,calendar_name:binding.calendarName,version:binding.version,unlinked_at:binding.unlinkedAt},scope);
  return {binding:current,fingerprint:googleOAuthClientFingerprint(clientId)};
 }catch{throw Error("GOOGLE_EVENT_COMMAND_INVALID");}
}
async function mutate(name:string,scope:GoogleWorkspace,eventId:string,operationId:string,binding:GoogleBinding,clientId:string,attemptVersion:string,fields:Record<string,unknown>):Promise<GoogleEventCommand>{
 const selected=capture(scope,eventId,operationId),captured=runtime(selected.scope,binding,clientId),revision=version(attemptVersion);
 const params={...args(selected.scope,selected.eventId,selected.operationId),p_client_fingerprint:captured.fingerprint,p_binding_version:captured.binding.version,p_attempt_version:revision,...fields};
 const creation=await loadGoogleEventCreation(selected.scope,selected.eventId);if(!creation)throw Error("GOOGLE_EVENT_ORIGIN_MISSING");googleEventOperationTarget(selected.scope,selected.eventId,creation.intent,captured.binding);
 return command(creation.intent,creation.payloadFingerprint,creation.payload.withMeet,selected.operationId!,await rpc(name,params));
}
export async function assertGoogleEventCommandActive(scope:GoogleWorkspace,eventId:string,operationId:string):Promise<void>{
 try{const selected=capture(scope,eventId,operationId);if(await rpc("active",args(selected.scope,selected.eventId,selected.operationId))!==true)throw Error("GOOGLE_EVENT_STORAGE_INVALID");}catch(error){throw safe(error);}
}
export async function assertGoogleEventCommandLease(scope:GoogleWorkspace,command:GoogleEventCommand,binding:GoogleBinding,clientId:string):Promise<void>{
 try{const selected=capture(scope,command.intent.eventId,command.operationId),captured=runtime(selected.scope,binding,clientId);googleEventOperationTarget(selected.scope,selected.eventId,command.intent,captured.binding);
  const lease=command.lease;if(command.state!=="running"||!lease||version(lease.bindingVersion,true)!==captured.binding.version)throw Error("GOOGLE_EVENT_ATTEMPT_CONFLICT");
  const params={...args(selected.scope,selected.eventId,selected.operationId),p_client_fingerprint:captured.fingerprint,p_binding_version:captured.binding.version,p_attempt_version:version(command.attemptVersion,true),p_lease_id:uuid(lease.id)};
  if(await rpc("preflight",params)!==true)throw Error("GOOGLE_EVENT_STORAGE_INVALID");
 }catch(error){throw safe(error);}
}
export async function claimGoogleEventCommand(scope:GoogleWorkspace,eventId:string,operationId:string,binding:GoogleBinding,clientId:string,attemptVersion:string):Promise<GoogleEventCommand>{
 try{const revision=version(attemptVersion),bindingVersion=version(binding.version,true),saved=await mutate("claim",scope,eventId,operationId,binding,clientId,revision,{});
  if(saved.state!=="running"||!saved.lease||saved.lease.bindingVersion!==bindingVersion||BigInt(saved.attemptVersion)!==BigInt(revision)+BigInt(1))throw Error("GOOGLE_EVENT_STORAGE_INVALID");return saved;
 }catch(error){throw safe(error);}
}
export async function retryGoogleEventCommand(scope:GoogleWorkspace,eventId:string,operationId:string,binding:GoogleBinding,clientId:string,attemptVersion:string):Promise<GoogleEventCommand>{
 try{const revision=version(attemptVersion),bindingVersion=version(binding.version,true),saved=await mutate("retry",scope,eventId,operationId,binding,clientId,revision,{});
  if(saved.state!=="queued"||saved.roundAttempts!==0||saved.authorizedBindingVersion!==bindingVersion||BigInt(saved.attemptVersion)!==BigInt(revision)+BigInt(1))throw Error("GOOGLE_EVENT_STORAGE_INVALID");return saved;
 }catch(error){throw safe(error);}
}
export async function finishGoogleEventCommand(scope:GoogleWorkspace,eventId:string,operationId:string,binding:GoogleBinding,clientId:string,attemptVersion:string,lease:GoogleEventCommandLease,outcome:GoogleEventCommandOutcome):Promise<GoogleEventCommand>{
 try{let fields:Record<string,unknown>;
  try{const row=object(outcome);if(Object.keys(row).some(key=>!["result","etag","meetLink","failureCode"].includes(key))||!["retry","waiting","succeeded","failed"].includes(row.result as string)||(row.failureCode!==null&&!FAILURES.some(code=>code===row.failureCode))||version(lease.bindingVersion,true)!==version(binding.version,true))throw Error();
   fields={p_lease_id:uuid(lease.id),p_result:row.result,p_etag:row.etag===null?null:text(row.etag),p_meet_link:link(row.meetLink),p_failure_code:row.failureCode};
  }catch{throw Error("GOOGLE_EVENT_COMMAND_INVALID");}
  const revision=version(attemptVersion),saved=await mutate("finish",scope,eventId,operationId,binding,clientId,revision,fields),exhausted=(fields.p_result==="retry"||fields.p_result==="waiting")&&saved.roundAttempts===10;
  if(saved.attemptVersion!==revision||saved.lease!==null||saved.state!==(exhausted?"failed":fields.p_result==="retry"?"queued":fields.p_result)||saved.failureCode!==(exhausted?"ATTEMPTS_EXHAUSTED":fields.p_failure_code)
   ||saved.meetLink!==fields.p_meet_link||(fields.p_etag!==null&&saved.etag!==fields.p_etag)||!saved.wasAttempted||saved.roundAttempts<1)throw Error("GOOGLE_EVENT_STORAGE_INVALID");return saved;
 }catch(error){throw safe(error);}
}
