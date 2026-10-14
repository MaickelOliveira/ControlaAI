import "server-only";
import {google} from "googleapis";
import {getSupabase} from "./supabase";
import {googleWorkspaceKey,type GoogleWorkspace} from "./google-workspace-policy";
import {googleEventExpectation,googleEventSyncVersion,type GoogleEventExpectation} from "./google-event-user-store";
import {loadGoogleAppointmentRows} from "./google-event-readmodel";
import {loadGoogleEventCommand,loadGoogleEventCommandHead,assertGoogleEventCommandActive,type GoogleEventCommand} from "./google-event-command-store";
import {loadGoogleBinding,type GoogleBinding} from "./google-binding-store";
import {googleEventOperationTarget} from "./google-event-policy";
import {assertGoogleEventProviderMarkers} from "./google-event-marker";
import {withGoogleWorkspaceClient} from "./google-workspace-runtime";
import {googleOAuthClientFingerprint} from "./google-oauth-state";
export type GoogleEventConflictConfirmation=GoogleEventExpectation&Readonly<{confirmOverwrite:true}>;
const SAFE=["GOOGLE_EVENT_INPUT_INVALID","GOOGLE_EVENT_CONFLICT","GOOGLE_EVENT_COMMAND_CONFLICT","GOOGLE_EVENT_NOT_FOUND","GOOGLE_EVENT_LOCAL_INACTIVE","GOOGLE_EVENT_LOCAL_CONFLICT","GOOGLE_EVENT_CONNECTION_CHANGED","GOOGLE_WORKSPACE_ACCESS_DENIED","GOOGLE_EVENT_STORAGE_INVALID"];
function object(value:unknown):Record<string,unknown>{if(!value||typeof value!=="object"||Array.isArray(value))throw Error();return value as Record<string,unknown>;}
function uuid(value:unknown):string{if(typeof value!=="string"||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value))throw Error();return value.toLowerCase();}
function capture(scope:GoogleWorkspace,eventId:string,expected:string){try{if(Object.keys(object(scope)).some(key=>!["userId","mode","companyId"].includes(key)))throw Error();googleWorkspaceKey(scope);googleEventSyncVersion(expected);return {scope:Object.freeze({...scope,userId:scope.userId.toLowerCase(),companyId:scope.companyId?.toLowerCase()??null}),eventId:uuid(eventId),expected};}catch{throw Error("GOOGLE_EVENT_INPUT_INVALID");}}
function confirmation(value:GoogleEventConflictConfirmation):GoogleEventExpectation{try{const row=object(value);if(row.confirmOverwrite!==true||Object.keys(row).some(key=>!["clientMutationId","expectedGoogleSyncVersion","confirmOverwrite"].includes(key)))throw Error();return googleEventExpectation({clientMutationId:row.clientMutationId,expectedGoogleSyncVersion:row.expectedGoogleSyncVersion},false);}catch{throw Error("GOOGLE_EVENT_INPUT_INVALID");}}
function ref(eventId:string,value:unknown){try{const row=object(value);if(Object.keys(row).some(key=>!["event_id","operation_id"].includes(key))||row.event_id!==eventId)throw Error();return Object.freeze({eventId,operationId:uuid(row.operation_id)});}catch{throw Error("GOOGLE_EVENT_STORAGE_INVALID");}}
async function rpc(name:string,args:Record<string,unknown>):Promise<unknown>{const result=await getSupabase().rpc(name,args);if(result.error)throw Error(SAFE.includes(result.error.message)?result.error.message:"GOOGLE_EVENT_UNAVAILABLE");return result.data;}
async function snapshot(selected:ReturnType<typeof capture>):Promise<GoogleEventCommand|null>{
 const rows=await loadGoogleAppointmentRows(selected.scope,{eventId:selected.eventId}),row=rows[0];if(!row)throw Error("GOOGLE_EVENT_NOT_FOUND");if(row.google_sync_version!==selected.expected)throw Error("GOOGLE_EVENT_CONFLICT");
 const head=await loadGoogleEventCommandHead(selected.scope,selected.eventId);if(!head?.operationId||head.deleted)return null;
 const command=await loadGoogleEventCommand(selected.scope,selected.eventId,head.operationId);
 if(!command||command.state!=="failed"||command.failureCode!=="ETAG_CONFLICT"||!['update','delete'].includes(command.kind))return null;
 const parts=googleEventSyncVersion(selected.expected);if(parts[1]!==head.version||command.headVersion!==head.version||command.attemptVersion!==parts[2]||command.operationId!==head.operationId)throw Error("GOOGLE_EVENT_CONFLICT");
 await assertGoogleEventCommandActive(selected.scope,selected.eventId,command.operationId);return command;
}
/** Read-only local capability: conferences are never eligible for overwrite. */
export async function inspectGoogleEventConflict(scope:GoogleWorkspace,eventId:string,expected:string):Promise<Readonly<{canOverwrite:boolean}>>{try{return Object.freeze({canOverwrite:(await snapshot(capture(scope,eventId,expected)))!==null});}catch(error){throw Error(error instanceof Error&&SAFE.includes(error.message)?error.message:"GOOGLE_EVENT_UNAVAILABLE");}}
async function guard(selected:ReturnType<typeof capture>,original:GoogleEventCommand,runtime:GoogleBinding):Promise<void>{
 const latest=await snapshot(selected),binding=await loadGoogleBinding(selected.scope);googleEventOperationTarget(selected.scope,selected.eventId,original.intent,binding);
 if(!latest||JSON.stringify(latest)!==JSON.stringify(original)||binding?.version!==runtime.version||binding.id!==runtime.id||binding.grantId!==runtime.grantId)throw Error("GOOGLE_EVENT_CONFLICT");
}
/** A human confirms the SAME failed update/delete. Fresh GET is read only;
 * original marker/target, scope and revision are rechecked before atomic SQL CAS.
 * A lost acknowledgment returns its immutable receipt before credentials/effects. */
export async function confirmGoogleEventConflict(scope:GoogleWorkspace,eventId:string,value:GoogleEventConflictConfirmation):Promise<Readonly<{eventId:string;operationId:string;replayed:boolean}>>{
 try{
  const expected=confirmation(value),selected=capture(scope,eventId,expected.expectedGoogleSyncVersion!),args={p_user_id:selected.scope.userId,p_mode:selected.scope.mode,p_company_id:selected.scope.companyId,p_event_id:selected.eventId,p_mutation_id:expected.clientMutationId,p_expected_sync_version:selected.expected};
  const receipt=await rpc("zelo_google_event_conflict_get",args);if(receipt!==null)return Object.freeze({...ref(selected.eventId,receipt),replayed:true});
  const command=await snapshot(selected);if(!command)throw Error("GOOGLE_EVENT_CONFLICT");
  const saved=await withGoogleWorkspaceClient(selected.scope,{bindingId:command.intent.bindingId,grantId:command.intent.grantId},async(auth,binding)=>{
   if(typeof auth._clientId!=="string")throw Error();await guard(selected,command,binding);
   const event=object((await google.calendar({version:"v3",auth}).events.get({calendarId:command.intent.calendarId,eventId:command.intent.remoteEventId},{timeout:15000,retry:false})).data);
   if(event.id!==command.intent.remoteEventId||!['confirmed','tentative'].includes(event.status as string)||typeof event.etag!=="string"||event.etag.length<1||event.etag.length>1024||/\p{Cc}/u.test(event.etag))throw Error("GOOGLE_EVENT_CONFLICT");
   assertGoogleEventProviderMarkers(command.intent,command.creationFingerprint,command.creationWithMeet,object(event.extendedProperties).private);await guard(selected,command,binding);
   return await rpc("zelo_google_event_conflict_confirm",{...args,p_operation_id:command.operationId,p_client_fingerprint:googleOAuthClientFingerprint(auth._clientId),p_binding_version:binding.version,p_etag:event.etag});
  });
  const result=ref(selected.eventId,saved);if(result.operationId!==command.operationId)throw Error("GOOGLE_EVENT_STORAGE_INVALID");return Object.freeze({...result,replayed:false});
 }catch(error){throw Error(error instanceof Error&&SAFE.includes(error.message)?error.message:"GOOGLE_EVENT_UNAVAILABLE");}
}
