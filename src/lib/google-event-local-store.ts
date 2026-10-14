import "server-only";
import {getSupabase} from "./supabase";
import {getAuthClient} from "./google-oauth";
import {loadGoogleBinding} from "./google-binding-store";
import {loadGoogleEventCreation} from "./google-event-creation-store";
import {googleEventRetryIdentity} from "./google-event-policy";
import {googleEventCreationPayload,type GoogleEventCreationPayload} from "./google-event-payload";
import {googleOAuthClientFingerprint} from "./google-oauth-state";
import type {GoogleWorkspace} from "./google-workspace-policy";

export type GoogleLocalAttendee=Readonly<{name:string;phone?:string;email?:string}>;
export type GoogleLocalEvent=Readonly<{eventId:string;appointmentId:string;meetId:string|null;kind:"appointment"|"meet";source:"web"|"whatsapp";attendees:readonly GoogleLocalAttendee[]}>;
type LocalInput=Readonly<{kind:GoogleLocalEvent["kind"];source:GoogleLocalEvent["source"];payload:GoogleEventCreationPayload;attendees:readonly GoogleLocalAttendee[]}>;
const STORAGE_ERRORS=["GOOGLE_EVENT_INVALID","GOOGLE_EVENT_CONNECTION_CHANGED","GOOGLE_EVENT_ORIGIN_CONFLICT","GOOGLE_EVENT_LOCAL_CONFLICT"];
const SAFE_ERRORS=[...STORAGE_ERRORS,"GOOGLE_EVENT_INPUT_INVALID","GOOGLE_EVENT_NOT_CONNECTED","GOOGLE_EVENT_CONFIGURATION_INVALID","GOOGLE_EVENT_STORAGE_UNAVAILABLE","GOOGLE_EVENT_STORAGE_INVALID"];
function safe(error:unknown):Error{
 if(error instanceof Error&&error.message==="GOOGLE_BINDING_STORAGE_INVALID")return Error("GOOGLE_EVENT_STORAGE_INVALID");
 if(error instanceof Error&&error.message==="GOOGLE_BINDING_STORAGE_UNAVAILABLE")return Error("GOOGLE_EVENT_STORAGE_UNAVAILABLE");
 return Error(error instanceof Error&&SAFE_ERRORS.includes(error.message)?error.message:"GOOGLE_EVENT_FAILED");
}
function record(value:unknown,keys:readonly string[]):Record<string,unknown>{
 if(!value||typeof value!=="object"||Array.isArray(value))throw Error();const row=value as Record<string,unknown>;
 if(Object.keys(row).some(key=>!keys.includes(key)))throw Error();return row;
}
function text(value:unknown,max:number):string{if(typeof value!=="string"||value.length>max||/\p{Cc}/u.test(value))throw Error();return value;}
function attendees(value:unknown):readonly GoogleLocalAttendee[]{
 if(!Array.isArray(value)||value.length>100)throw Error();
 const result=Object.freeze(value.map(entry=>{
  const row=record(entry,["name","phone","email"]),name=text(row.name,256);
  return Object.freeze({name,...(row.phone===undefined?{}:{phone:text(row.phone,64)}),...(row.email===undefined?{}:{email:text(row.email,254)})});
 }));
 if(Buffer.byteLength(JSON.stringify(result),"utf8")>8000)throw Error();return result;
}
function source(value:unknown):GoogleLocalEvent["source"]{if(value!=="web"&&value!=="whatsapp")throw Error();return value;}
function kind(value:unknown):GoogleLocalEvent["kind"]{if(value!=="appointment"&&value!=="meet")throw Error();return value;}
function input(value:unknown):LocalInput{
 try{
  const row=record(value,["kind","source","payload","attendees"]),selectedKind=kind(row.kind),selectedSource=source(row.source),localAttendees=attendees(row.attendees),payload=googleEventCreationPayload(row.payload);
  if(selectedKind==="appointment"&&localAttendees.length)throw Error();
  if(selectedKind==="meet"){
   if(!payload.withMeet||payload.allDay||payload.repeat!=="none")throw Error();
   const guests=localAttendees.filter(entry=>entry.email!==undefined).map(entry=>({email:entry.email,displayName:entry.name}));
   const expected=googleEventCreationPayload({...payload,attendees:guests});
   if(JSON.stringify(expected.attendees)!==JSON.stringify(payload.attendees))throw Error();
  }
  return Object.freeze({kind:selectedKind,source:selectedSource,payload,attendees:localAttendees});
 }catch{throw Error("GOOGLE_EVENT_INPUT_INVALID");}
}
function capture(scope:GoogleWorkspace,eventId:string){
 try{googleEventRetryIdentity(scope,eventId);return {scope:Object.freeze({userId:scope.userId.toLowerCase(),mode:scope.mode,companyId:scope.companyId?.toLowerCase()??null}),eventId:eventId.toLowerCase()};}
 catch{throw Error("GOOGLE_EVENT_INPUT_INVALID");}
}
function args(scope:GoogleWorkspace,eventId:string){return {p_user_id:scope.userId,p_mode:scope.mode,p_company_id:scope.companyId,p_event_id:eventId};}
async function rpc(name:string,params:Record<string,unknown>):Promise<unknown>{
 try{const {data,error}=await getSupabase().rpc(name,params);if(error){if(STORAGE_ERRORS.includes(error.message))throw Error(error.message);throw Error();}return data;}
 catch(error){if(error instanceof Error&&STORAGE_ERRORS.includes(error.message))throw error;throw Error("GOOGLE_EVENT_STORAGE_UNAVAILABLE");}
}
function linked(eventId:string,value:unknown):GoogleLocalEvent{
 try{
  if(!value||typeof value!=="object"||Array.isArray(value))throw Error();const row=value as Record<string,unknown>,selectedKind=kind(row.kind);
  if(row.event_id!==eventId||row.appointment_id!==eventId||row.meet_id!==(selectedKind==="meet"?eventId:null))throw Error();
  const metadata=record(row.local_metadata,["source","attendees"]),selectedSource=source(metadata.source),localAttendees=attendees(metadata.attendees);
  if(selectedKind==="appointment"&&localAttendees.length)throw Error();
  return Object.freeze({eventId,appointmentId:eventId,meetId:selectedKind==="meet"?eventId:null,kind:selectedKind,source:selectedSource,attendees:localAttendees});
 }catch{throw Error("GOOGLE_EVENT_STORAGE_INVALID");}
}
async function read(scope:GoogleWorkspace,eventId:string):Promise<GoogleLocalEvent|null>{
 const value=await rpc("zelo_google_event_local_get",args(scope,eventId));return value===null?null:linked(eventId,value);
}
function same(link:GoogleLocalEvent,selected:LocalInput):boolean{return link.kind===selected.kind&&link.source===selected.source&&JSON.stringify(link.attendees)===JSON.stringify(selected.attendees);}
/** Scope comes from verified request/participant/job context. Private linkage is
 * history only; a later worker must authorize active local records for effects. */
export async function loadGoogleLocalEvent(scope:GoogleWorkspace,eventId:string):Promise<GoogleLocalEvent|null>{
 try{const selected=capture(scope,eventId);return await read(selected.scope,selected.eventId);}catch(error){throw safe(error);}
}
/** New authorized logical UUID only. No legacy create helper or provider call;
 * the invoker-only RPC atomically stores origin/payload, local records and link. */
export async function prepareGoogleLocalEvent(scope:GoogleWorkspace,eventId:string,value:unknown):Promise<GoogleLocalEvent>{
 try{
  const selected=capture(scope,eventId),normalized=input(value),existing=await read(selected.scope,selected.eventId);
  if(existing){
   const creation=await loadGoogleEventCreation(selected.scope,selected.eventId);
   if(!creation)throw Error("GOOGLE_EVENT_STORAGE_INVALID");
   if(!same(existing,normalized)||JSON.stringify(creation.payload)!==JSON.stringify(normalized.payload))throw Error("GOOGLE_EVENT_LOCAL_CONFLICT");return existing;
  }
  const client=await getAuthClient();if(typeof client._clientId!=="string"||!client._clientId)throw Error("GOOGLE_EVENT_CONFIGURATION_INVALID");
  const fingerprint=googleOAuthClientFingerprint(client._clientId),binding=await loadGoogleBinding(selected.scope);
  if(!binding||binding.unlinkedAt!==null)throw Error("GOOGLE_EVENT_NOT_CONNECTED");
  const saved=linked(selected.eventId,await rpc("zelo_google_event_local_create",{...args(selected.scope,selected.eventId),p_binding_id:binding.id,p_grant_id:binding.grantId,p_binding_version:binding.version,p_client_fingerprint:fingerprint,p_payload:normalized.payload,p_kind:normalized.kind,p_source:normalized.source,p_attendees:normalized.attendees}));
  const creation=await loadGoogleEventCreation(selected.scope,selected.eventId);
  if(!creation||!same(saved,normalized)||JSON.stringify(creation.payload)!==JSON.stringify(normalized.payload)
   ||creation.intent.bindingId!==binding.id||creation.intent.grantId!==binding.grantId||creation.intent.bindingVersion!==binding.version||creation.intent.calendarId!==binding.calendarId)throw Error("GOOGLE_EVENT_STORAGE_INVALID");return saved;
 }catch(error){throw safe(error);}
}
