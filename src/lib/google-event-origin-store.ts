import "server-only";
import {getSupabase} from "./supabase";
import {getAuthClient} from "./google-oauth";
import {loadGoogleBinding,type GoogleBinding} from "./google-binding-store";
import {googleOAuthBindingVersion,googleOAuthClientFingerprint} from "./google-oauth-state";
import {googleEventOriginFromStorage,googleEventRetryIdentity,type GoogleEventOrigin} from "./google-event-policy";
import type {GoogleWorkspace} from "./google-workspace-policy";

export type GoogleEventIntent=Readonly<GoogleEventOrigin&{bindingVersion:string;conferenceRequestId:string}>;
const STORAGE_ERRORS=["GOOGLE_EVENT_INVALID","GOOGLE_EVENT_CONNECTION_CHANGED","GOOGLE_EVENT_ORIGIN_CONFLICT"];
const SAFE_ERRORS=[...STORAGE_ERRORS,"GOOGLE_EVENT_INPUT_INVALID","GOOGLE_EVENT_NOT_CONNECTED","GOOGLE_EVENT_CONFIGURATION_INVALID","GOOGLE_EVENT_STORAGE_UNAVAILABLE","GOOGLE_EVENT_STORAGE_INVALID"];
function safe(error:unknown):Error{
 if(error instanceof Error&&error.message==="GOOGLE_BINDING_STORAGE_INVALID")return Error("GOOGLE_EVENT_STORAGE_INVALID");
 if(error instanceof Error&&error.message==="GOOGLE_BINDING_STORAGE_UNAVAILABLE")return Error("GOOGLE_EVENT_STORAGE_UNAVAILABLE");
 return Error(error instanceof Error&&SAFE_ERRORS.includes(error.message)?error.message:"GOOGLE_EVENT_FAILED");
}
function capture(scope:GoogleWorkspace,eventId:string){
 try{
  googleEventRetryIdentity(scope,eventId);
  return {scope:Object.freeze({userId:scope.userId.toLowerCase(),mode:scope.mode,companyId:scope.companyId?.toLowerCase()??null}),eventId:eventId.toLowerCase()};
 }catch{throw Error("GOOGLE_EVENT_INPUT_INVALID");}
}
function args(scope:GoogleWorkspace,eventId:string){return {p_user_id:scope.userId,p_mode:scope.mode,p_company_id:scope.companyId,p_event_id:eventId};}
async function rpc(name:string,params:Record<string,unknown>):Promise<unknown>{
 try{
  const {data,error}=await getSupabase().rpc(name,params);
  if(error){if(STORAGE_ERRORS.includes(error.message))throw Error(error.message);throw Error();}return data;
 }catch(error){if(error instanceof Error&&STORAGE_ERRORS.includes(error.message))throw error;throw Error("GOOGLE_EVENT_STORAGE_UNAVAILABLE");}
}
function intent(scope:GoogleWorkspace,eventId:string,value:unknown):GoogleEventIntent{
 try{
  if(!value||typeof value!=="object"||Array.isArray(value))throw Error();const row=value as Record<string,unknown>;
  const origin=googleEventOriginFromStorage(scope,eventId,row),identity=googleEventRetryIdentity(scope,eventId),bindingVersion=googleOAuthBindingVersion(row.binding_version);
  if(bindingVersion==="0"||origin.remoteEventId!==identity.remoteEventId||row.conference_request_id!==identity.conferenceRequestId)throw Error();
  return Object.freeze({...origin,bindingVersion,conferenceRequestId:identity.conferenceRequestId});
 }catch{throw Error("GOOGLE_EVENT_STORAGE_INVALID");}
}
/** Read only after authorizing the exact local record. History metadata is not
 * provider authorization, and this function never reads Google credentials. */
export async function loadGoogleEventIntent(scope:GoogleWorkspace,eventId:string):Promise<GoogleEventIntent|null>{
 try{const selected=capture(scope,eventId),data=await rpc("zelo_google_event_origin_get",args(selected.scope,selected.eventId));return data===null?null:intent(selected.scope,selected.eventId,data);}
 catch(error){throw safe(error);}
}
function unchanged(binding:GoogleBinding,saved:GoogleEventIntent):void{
 if(binding.id!==saved.bindingId||binding.grantId!==saved.grantId||binding.calendarId!==saved.calendarId||binding.version!==saved.bindingVersion)throw Error("GOOGLE_EVENT_STORAGE_INVALID");
}
/** Reserve only for a newly authorized logical event, before its first provider
 * call. Do not use this to assign provenance to a historical appointment/Meet.
 * No production caller or public-record linkage is installed yet. */
export async function reserveGoogleEventIntent(scope:GoogleWorkspace,eventId:string):Promise<GoogleEventIntent>{
 try{
  const selected=capture(scope,eventId),client=await getAuthClient();
  if(typeof client._clientId!=="string"||!client._clientId)throw Error("GOOGLE_EVENT_CONFIGURATION_INVALID");
  const fingerprint=googleOAuthClientFingerprint(client._clientId),binding=await loadGoogleBinding(selected.scope);
  if(!binding||binding.unlinkedAt!==null)throw Error("GOOGLE_EVENT_NOT_CONNECTED");
  const data=await rpc("zelo_google_event_origin_reserve",{...args(selected.scope,selected.eventId),p_binding_id:binding.id,p_grant_id:binding.grantId,p_binding_version:binding.version,p_client_fingerprint:fingerprint});
  const saved=intent(selected.scope,selected.eventId,data);unchanged(binding,saved);return saved;
 }catch(error){throw safe(error);}
}
