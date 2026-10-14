import "server-only";
import {randomUUID} from "node:crypto";
import {googleEventChangePayload,type GoogleEventChangePayload} from "./google-event-command-policy";
import {loadGoogleEventCommand,prepareGoogleEventCommand} from "./google-event-command-store";
import {synchronizeGoogleEventCommand} from "./google-event-command-sync";
import {googleEventExpectation,googleEventSyncVersion,loadGoogleEventControlledSnapshot,loadGoogleAppointmentLocalMutation,loadGoogleEventUserRetry,retryGoogleEventUserIntent,patchGoogleAppointmentLocal,type GoogleEventExpectation,type GoogleAppointmentLocalMetadata,type GoogleEventControlledSnapshot} from "./google-event-user-store";
export type {GoogleEventExpectation} from "./google-event-user-store";
import type {Appointment,AppointmentRepeat,GoogleSyncMetadata} from "./agenda";
import type {Meet} from "./meets";
import {googleWorkspaceKey,type GoogleWorkspace} from "./google-workspace-policy";
import {googleEventCreationPayload,type GoogleEventCreationPayload} from "./google-event-payload";
import {loadGoogleAppointmentRows,loadGoogleMeetRows,type GoogleAppointmentRow,type GoogleMeetRow,type GoogleEventReadSync} from "./google-event-readmodel";
import {loadGoogleLocalEvent,prepareGoogleLocalEvent,type GoogleLocalAttendee} from "./google-event-local-store";
import {loadLocalAppointmentReceipt,prepareLocalAppointmentReceipt} from "./google-local-appointment-store";
import {loadGoogleBinding} from "./google-binding-store";
import {loadGoogleOwnerActivation} from "./google-owner-activation";
import {synchronizeGoogleEventCreation} from "./google-event-creation-sync";
export type WorkspaceAppointment=Appointment&GoogleSyncMetadata;
export type WorkspaceMeet=Meet&GoogleSyncMetadata;
export type WorkspaceEventInput=Readonly<{title:string;description?:string;location?:string;startAt:string;endAt?:string;allDay?:boolean;repeat?:AppointmentRepeat;withMeet?:boolean;
 attendees?:readonly Readonly<{name?:string;displayName?:string;phone?:string;email?:string}>[]}>;
export type WorkspaceMeetInput=Readonly<Pick<WorkspaceEventInput,"title"|"description"|"startAt"|"attendees">&{endAt:string}>;
type EventSource="web"|"whatsapp";
function object(value:unknown,keys:readonly string[]):Record<string,unknown>{if(!value||typeof value!=="object"||Array.isArray(value))throw Error();const row=value as Record<string,unknown>;if(Object.keys(row).some(key=>!keys.includes(key)))throw Error();return row;}
function uuid(value:unknown):string{if(typeof value!=="string"||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value))throw Error();return value.toLowerCase();}
function capture(scope:GoogleWorkspace,eventId?:string){
 try{object(scope,["userId","mode","companyId"]);googleWorkspaceKey(scope);return Object.freeze({scope:Object.freeze({userId:scope.userId.toLowerCase(),mode:scope.mode,companyId:scope.companyId?.toLowerCase()??null}),eventId:eventId===undefined?undefined:uuid(eventId)});}
 catch{throw Error("GOOGLE_EVENT_INPUT_INVALID");}
}
function sync(row:GoogleEventReadSync):GoogleSyncMetadata{return {googleSyncVersion:row.google_sync_version,googleSyncState:row.google_sync_state,googleSyncFailureCode:row.google_sync_failure_code,googleMeetPending:row.google_meet_pending,googleCancellationPending:row.google_cancellation_pending};}
function calendar(value:string|null):{calendarEventId?:string;googleCalendarId?:string}{
 if(!value)return {};
 if(value.startsWith("gcal:")){try{const parsed=JSON.parse(value.slice(5));if(typeof parsed.eventId==="string"&&typeof parsed.calendarId==="string")return {calendarEventId:parsed.eventId,googleCalendarId:parsed.calendarId};}catch{/* Historical display only. */}}
 return {calendarEventId:value,googleCalendarId:"primary"};
}
function appointment(row:GoogleAppointmentRow):WorkspaceAppointment{return Object.freeze({id:row.id,userId:row.user_id,companyId:row.company_id??undefined,workspaceLegacy:row.workspace_legacy,title:row.title,description:row.description??undefined,location:row.location??undefined,startAt:row.start_at,endAt:row.end_at??undefined,allDay:row.all_day,repeat:row.repeat,status:row.status,source:row.source,createdAt:row.created_at,meetLink:row.meet_link??undefined,...calendar(row.calendar_event_id),ataGenerated:row.ata_generated,ataContent:row.ata_content??undefined,ataNotifiedAt:row.ata_notified_at??undefined,reminderSentAt:row.reminder_sent_at??undefined,reminder15MinSentAt:row.reminder_15min_sent_at??undefined,...sync(row)});}
function meet(row:GoogleMeetRow):WorkspaceMeet{return Object.freeze({id:row.id,userId:row.user_id,companyId:row.company_id??undefined,workspaceLegacy:row.workspace_legacy,title:row.title,description:row.description??undefined,startAt:row.start_at,endAt:row.end_at,meetLink:row.meet_link,calendarEventId:calendar(row.calendar_event_id).calendarEventId??"",attendees:row.attendees.map(entry=>({...entry})),ataGenerated:row.ata_generated,ataContent:row.ata_content??undefined,ataNotifiedAt:row.ata_notified_at??undefined,status:row.status,source:row.source,createdAt:row.created_at,...sync(row)});}
export async function listWorkspaceAppointments(scope:GoogleWorkspace):Promise<WorkspaceAppointment[]>{const selected=capture(scope);return (await loadGoogleAppointmentRows(selected.scope)).map(appointment).sort((a,b)=>a.startAt.localeCompare(b.startAt));}
export async function getWorkspaceAppointment(scope:GoogleWorkspace,eventId:string):Promise<WorkspaceAppointment|null>{const selected=capture(scope,eventId);const rows=await loadGoogleAppointmentRows(selected.scope,{eventId:selected.eventId!});return rows[0]?appointment(rows[0]):null;}
export async function listWorkspaceMeets(scope:GoogleWorkspace):Promise<WorkspaceMeet[]>{const selected=capture(scope);return (await loadGoogleMeetRows(selected.scope)).map(meet).sort((a,b)=>a.startAt.localeCompare(b.startAt));}
export async function getWorkspaceMeet(scope:GoogleWorkspace,eventId:string):Promise<WorkspaceMeet|null>{const selected=capture(scope,eventId);const rows=await loadGoogleMeetRows(selected.scope,{eventId:selected.eventId!});return rows[0]?meet(rows[0]):null;}
function text(value:unknown,max:number):string{if(typeof value!=="string"||value.length>max||/\p{Cc}/u.test(value))throw Error();return value;}
function instant(value:unknown):string{
 // The canonical payload validator also rejects impossible dates/offsets.
 return googleEventCreationPayload({summary:"Time",description:"",location:"",startAt:value,endAt:typeof value==="string"?new Date(Date.parse(value)+3600000).toISOString():"",allDay:false,repeat:"none",attendees:[],withMeet:false}).startAt;
}
function day(value:unknown):string{if(typeof value!=="string")throw Error();if(/^\d{4}-\d{2}-\d{2}$/.test(value))return value;const date=instant(value);return new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(date));}
function nextDay(value:string):string{return new Date(Date.parse(value+"T00:00:00Z")+86400000).toISOString().slice(0,10);}
function canonical(value:unknown,kind:"appointment"|"meet",source:EventSource):Readonly<{payload:GoogleEventCreationPayload;attendees:readonly GoogleLocalAttendee[];source:EventSource}>{
 try{
  const row=object(value,kind==="meet"?["title","description","startAt","endAt","attendees"]:["title","description","location","startAt","endAt","allDay","repeat","withMeet","attendees"]);
  if(source!=="web"&&source!=="whatsapp"||row.allDay!==undefined&&typeof row.allDay!=="boolean"||row.withMeet!==undefined&&typeof row.withMeet!=="boolean")throw Error();
  const allDay=kind==="appointment"&&(row.allDay??false) as boolean,withMeet=kind==="meet"||(row.withMeet??false) as boolean;
  const startAt=allDay?day(row.startAt):instant(row.startAt);let endAt:string;
  if(allDay){endAt=row.endAt===undefined?nextDay(startAt):day(row.endAt);if(endAt===startAt)endAt=nextDay(startAt);}
  else endAt=row.endAt===undefined?new Date(Date.parse(startAt)+3600000).toISOString():instant(row.endAt);
  if(kind==="meet"&&row.endAt===undefined||withMeet&&allDay)throw Error();
  const guests=row.attendees??[];if(!Array.isArray(guests)||guests.length>100)throw Error();
  const attendees=Object.freeze(guests.map(entry=>{const guest=object(entry,["name","displayName","email","phone"]);
   if(guest.name!==undefined&&guest.displayName!==undefined&&guest.name!==guest.displayName)throw Error();
   return Object.freeze({name:text(guest.name??guest.displayName??guest.email??"",256),...(guest.phone===undefined?{}:{phone:text(guest.phone,64)}),...(guest.email===undefined?{}:{email:text(guest.email,254)})});}));
  const payload=googleEventCreationPayload({summary:row.title,description:row.description??"",location:row.location??"",startAt,endAt,allDay,repeat:row.repeat??"none",attendees:attendees.filter(entry=>entry.email!==undefined).map(entry=>({email:entry.email,displayName:entry.name})),withMeet});
  return Object.freeze({payload,attendees:kind==="meet"?attendees:Object.freeze([]),source});
 }catch{throw Error("GOOGLE_EVENT_INPUT_INVALID");}
}
async function synchronize(scope:GoogleWorkspace,eventId:string):Promise<void>{try{await synchronizeGoogleEventCreation(scope,eventId);}catch(error){if(!(error instanceof Error&&error.message==="GOOGLE_EVENT_SYNC_UNAVAILABLE"))throw Error("GOOGLE_EVENT_UNAVAILABLE");}}
async function create(scope:GoogleWorkspace,eventId:string,value:WorkspaceEventInput|WorkspaceMeetInput,source:EventSource,kind:"appointment"|"meet"):Promise<void>{
 const selected=capture(scope,eventId),id=selected.eventId!,input=canonical(value,kind,source);
 const existing=await loadGoogleLocalEvent(selected.scope,id);
 if(existing){await prepareGoogleLocalEvent(selected.scope,id,{...input,kind});return;}
 const receipt=await loadLocalAppointmentReceipt(selected.scope,id);
 if(receipt){if(kind!=="appointment"||input.payload.withMeet)throw Error("GOOGLE_EVENT_CONFLICT");await prepareLocalAppointmentReceipt(selected.scope,id,input.payload,input.source);return;}
 const binding=await loadGoogleBinding(selected.scope);
 if(!binding||binding.unlinkedAt!==null){
  if(kind!=="appointment"||input.payload.withMeet)throw Error("GOOGLE_EVENT_NOT_CONNECTED");await prepareLocalAppointmentReceipt(selected.scope,id,input.payload,input.source);return;
 }
 if(!await loadGoogleOwnerActivation(selected.scope.userId))throw Error("GOOGLE_EVENT_NOT_CONNECTED");
 await prepareGoogleLocalEvent(selected.scope,id,{...input,kind});await synchronize(selected.scope,id);
}
/** Authenticated scope and stable caller UUID; save the one local intention
 * before effects. Historical global connections never select a destination. */
export async function createWorkspaceAppointment(scope:GoogleWorkspace,eventId:string,value:WorkspaceEventInput,source:EventSource):Promise<WorkspaceAppointment>{const selected=capture(scope,eventId);await create(selected.scope,selected.eventId!,value,source,"appointment");const result=await getWorkspaceAppointment(selected.scope,selected.eventId!);if(!result)throw Error("GOOGLE_EVENT_UNAVAILABLE");return result;}
export async function createWorkspaceMeet(scope:GoogleWorkspace,eventId:string,value:WorkspaceMeetInput,source:EventSource):Promise<WorkspaceMeet>{const selected=capture(scope,eventId);await create(selected.scope,selected.eventId!,value,source,"meet");const result=await getWorkspaceMeet(selected.scope,selected.eventId!);if(!result)throw Error("GOOGLE_EVENT_UNAVAILABLE");return result;}

export type WorkspaceAppointmentPatch=Readonly<Partial<Pick<Appointment,"title"|"description"|"location"|"startAt"|"endAt"|"allDay"|"repeat"|"status"|"ataGenerated"|"ataContent"|"ataNotifiedAt"|"reminderSentAt"|"reminder15MinSentAt">>&{attendees?:WorkspaceEventInput["attendees"]}>;
const CONTROLLED=["title","description","location","startAt","endAt","allDay","repeat","attendees"];
const META:Record<string,string>={status:"status",ataGenerated:"ata_generated",ataContent:"ata_content",ataNotifiedAt:"ata_notified_at",reminderSentAt:"reminder_sent_at",reminder15MinSentAt:"reminder_15min_sent_at"};
function patchInput(value:unknown):Readonly<Record<string,unknown>>{
 try{const row=object(value,[...CONTROLLED,...Object.keys(META)]);if(!Object.keys(row).length||Object.keys(row).some(key=>CONTROLLED.includes(key))&&Object.keys(row).some(key=>key in META))throw Error();
  const result:Record<string,unknown>={};for(const [key,entry] of Object.entries(row)){
   if(key==="allDay"||key==="ataGenerated"){if(typeof entry!=="boolean")throw Error();}
   else if(key==="status"){if(entry!=="scheduled"&&entry!=="done"&&entry!=="cancelled")throw Error();}
   else if(key==="repeat"){if(!["none","daily","weekly","monthly","yearly"].includes(entry as string))throw Error();}
   else if(key==="attendees"){
    if(!Array.isArray(entry)||entry.length>100)throw Error();result[key]=Object.freeze(entry.map(value=>{const guest=object(value,["name","displayName","phone","email"]);return Object.freeze(Object.fromEntries(Object.entries(guest).map(([key,value])=>[key,text(value,key==="phone"?64:key==="email"?254:256)])));}));continue;
   }else if(typeof entry!=="string"||entry.length>(key==="ataContent"?65536:key==="description"?8192:key==="location"?1024:512))throw Error();
   if(key==="title"&&!String(entry).trim())throw Error();result[key]=entry;
  }return Object.freeze(result);
 }catch{throw Error("GOOGLE_EVENT_INPUT_INVALID");}
}
async function current(scope:GoogleWorkspace,eventId:string):Promise<WorkspaceAppointment>{const row=await getWorkspaceAppointment(scope,eventId);if(!row)throw Error("GOOGLE_EVENT_NOT_FOUND");return row;}
function unchanged(row:WorkspaceAppointment,expectation:GoogleEventExpectation):void{if(row.googleSyncVersion!==expectation.expectedGoogleSyncVersion)throw Error("GOOGLE_EVENT_CONFLICT");}
async function activeOwner(scope:GoogleWorkspace):Promise<void>{if(!await loadGoogleOwnerActivation(scope.userId))throw Error("GOOGLE_EVENT_NOT_CONNECTED");}
function head(expectation:GoogleEventExpectation):string{return googleEventSyncVersion(expectation.expectedGoogleSyncVersion)[1];}
async function commandEffect(scope:GoogleWorkspace,eventId:string,operationId:string):Promise<void>{try{await synchronizeGoogleEventCommand(scope,eventId,operationId);}catch(error){if(!(error instanceof Error&&error.message==="GOOGLE_EVENT_SYNC_UNAVAILABLE"))throw Error("GOOGLE_EVENT_UNAVAILABLE");}}
function changedPayload(base:GoogleEventControlledSnapshot,patch:Readonly<Record<string,unknown>>):Readonly<{payload:GoogleEventChangePayload;attendees:readonly GoogleLocalAttendee[]}>{
 const previous=base.payload,title=patch.title===undefined?previous.summary:patch.title;
 const guests=patch.attendees??(base.kind==="meet"?base.attendees:previous.attendees);
 const values={title:base.kind==="meet"&&typeof title==="string"&&title.startsWith("🎥 ")?title.slice(3):title,description:patch.description??previous.description,location:patch.location??previous.location,
  startAt:patch.startAt??previous.startAt,endAt:patch.endAt??previous.endAt,allDay:patch.allDay??previous.allDay,repeat:patch.repeat??previous.repeat,attendees:guests};
 const normalized=canonical(values,"appointment","web"),payload=googleEventChangePayload(Object.fromEntries(Object.entries(normalized.payload).filter(([key])=>key!=="withMeet")));
 let attendees:readonly GoogleLocalAttendee[]=Object.freeze([]);
 if(base.kind==="meet"){
  if(payload.allDay||payload.repeat!=="none")throw Error("GOOGLE_EVENT_INPUT_INVALID");
  const meeting=canonical({title:payload.summary,description:payload.description,startAt:payload.startAt,endAt:payload.endAt,attendees:guests},"meet","web");attendees=meeting.attendees;
 }return Object.freeze({payload,attendees});
}
function localControlled(row:WorkspaceAppointment):GoogleEventControlledSnapshot{
 const normalized=canonical({title:row.title,description:row.description??"",location:row.location??"",startAt:row.startAt,...(row.endAt===undefined?{}:{endAt:row.endAt}),allDay:row.allDay,repeat:row.repeat},"appointment","web");
 return {kind:"appointment",payload:googleEventChangePayload(Object.fromEntries(Object.entries(normalized.payload).filter(([key])=>key!=="withMeet"))),attendees:[]};
}
/** Controlled edits use the original confirmed complete revision. Independent
 * local minutes/status/reminders never enter configuration or Google runtime. */
export async function updateWorkspaceAppointment(scope:GoogleWorkspace,eventId:string,value:WorkspaceAppointmentPatch,expectation?:GoogleEventExpectation):Promise<WorkspaceAppointment>{
 const selected=capture(scope,eventId),id=selected.eventId!,patch=patchInput(value),confirmed=expectation===undefined?undefined:googleEventExpectation(expectation),controlled=Object.keys(patch).some(key=>CONTROLLED.includes(key));
 if(patch.status==="cancelled"){if(Object.keys(patch).length!==1||!confirmed)throw Error("GOOGLE_EVENT_INPUT_INVALID");return await cancelWorkspaceAppointment(selected.scope,id,confirmed);}
 if(controlled&&!confirmed)throw Error("GOOGLE_EVENT_INPUT_INVALID");const row=await current(selected.scope,id);
 if(!controlled){const metadata=Object.fromEntries(Object.entries(patch).map(([key,value])=>[META[key],value])) as GoogleAppointmentLocalMetadata;
  await patchGoogleAppointmentLocal(selected.scope,id,confirmed??{clientMutationId:randomUUID(),expectedGoogleSyncVersion:row.googleSyncVersion},null,metadata);return await current(selected.scope,id);
 }
 if(confirmed!.expectedGoogleSyncVersion===null){
  const receipt=await loadGoogleAppointmentLocalMutation(selected.scope,id,confirmed!);if(receipt&&(receipt.payload===null||Object.keys(receipt.metadata).length))throw Error("GOOGLE_EVENT_CONFLICT");
  const base=receipt?{kind:"appointment" as const,payload:googleEventChangePayload(Object.fromEntries(Object.entries(receipt.payload!).filter(([key])=>key!=="withMeet"))),attendees:[]}:localControlled(row);
  const changed=changedPayload(base,patch);await patchGoogleAppointmentLocal(selected.scope,id,confirmed!,{...changed.payload,withMeet:false},{});return await current(selected.scope,id);
 }
 const prior=await loadGoogleEventCommand(selected.scope,id,confirmed!.clientMutationId);let base:GoogleEventControlledSnapshot;
 if(prior){const link=await loadGoogleLocalEvent(selected.scope,id);if(!link||prior.kind!=="update"||!prior.payload)throw Error("GOOGLE_EVENT_CONFLICT");base={kind:link.kind,payload:prior.payload,attendees:prior.localAttendees??[]};}
 else{unchanged(row,confirmed!);base=await loadGoogleEventControlledSnapshot(selected.scope,id,confirmed!);await activeOwner(selected.scope);}
 const changed=changedPayload(base,patch);await prepareGoogleEventCommand(selected.scope,id,confirmed!.clientMutationId,head(confirmed!),{kind:"update",...changed},confirmed!.expectedGoogleSyncVersion!);
 if(!prior)await commandEffect(selected.scope,id,confirmed!.clientMutationId);return await current(selected.scope,id);
}
/** Logical cancellation keeps history and cancels both linked local records
 * before one original-target conditional DELETE. Local/legacy rows stay local. */
export async function cancelWorkspaceAppointment(scope:GoogleWorkspace,eventId:string,expectation:GoogleEventExpectation):Promise<WorkspaceAppointment>{
 const selected=capture(scope,eventId),id=selected.eventId!,confirmed=googleEventExpectation(expectation),row=await current(selected.scope,id);
 if(confirmed.expectedGoogleSyncVersion===null){await patchGoogleAppointmentLocal(selected.scope,id,confirmed,null,{status:"cancelled"});return await current(selected.scope,id);}
 const prior=await loadGoogleEventCommand(selected.scope,id,confirmed.clientMutationId);if(prior&&prior.kind!=="delete")throw Error("GOOGLE_EVENT_CONFLICT");
 if(!prior){unchanged(row,confirmed);await activeOwner(selected.scope);}
 await prepareGoogleEventCommand(selected.scope,id,confirmed.clientMutationId,head(confirmed),{kind:"delete"},confirmed.expectedGoogleSyncVersion);
 if(!prior)await commandEffect(selected.scope,id,confirmed.clientMutationId);return await current(selected.scope,id);
}
/** A conference can only be added to explicit original private provenance. */
export async function addWorkspaceAppointmentMeet(scope:GoogleWorkspace,eventId:string,expectation:GoogleEventExpectation):Promise<WorkspaceAppointment>{
 const selected=capture(scope,eventId),id=selected.eventId!,confirmed=googleEventExpectation(expectation),row=await current(selected.scope,id);
 if(confirmed.expectedGoogleSyncVersion===null)throw Error("GOOGLE_EVENT_ORIGIN_MISSING");
 const prior=await loadGoogleEventCommand(selected.scope,id,confirmed.clientMutationId);if(prior&&prior.kind!=="conference")throw Error("GOOGLE_EVENT_CONFLICT");
 if(!prior){unchanged(row,confirmed);if(row.meetLink)return row;await activeOwner(selected.scope);}
 await prepareGoogleEventCommand(selected.scope,id,confirmed.clientMutationId,head(confirmed),{kind:"conference"},confirmed.expectedGoogleSyncVersion);
 if(!prior)await commandEffect(selected.scope,id,confirmed.clientMutationId);return await current(selected.scope,id);
}
/** Explicit retry retains ambiguous operation identity. Only definitive matched
 * conference failure permits a newly journaled conference request. */
export async function retryWorkspaceGoogleEvent(scope:GoogleWorkspace,eventId:string,expectation:GoogleEventExpectation):Promise<WorkspaceAppointment>{
 const selected=capture(scope,eventId),id=selected.eventId!,confirmed=googleEventExpectation(expectation,false),row=await current(selected.scope,id);
 if(await loadGoogleEventUserRetry(selected.scope,id,confirmed))return row;
 const prior=await loadGoogleEventCommand(selected.scope,id,confirmed.clientMutationId);
 if(prior){if(prior.kind!=="conference")throw Error("GOOGLE_EVENT_CONFLICT");return await addWorkspaceAppointmentMeet(selected.scope,id,confirmed);}
 unchanged(row,confirmed);
 if(row.googleSyncFailureCode==="CONFERENCE_FAILED")return await addWorkspaceAppointmentMeet(selected.scope,id,confirmed);
 await activeOwner(selected.scope);const retry=await retryGoogleEventUserIntent(selected.scope,id,confirmed);
 if(!retry.replayed){if(retry.operationId===null)await synchronize(selected.scope,id);else await commandEffect(selected.scope,id,retry.operationId);}
 return await current(selected.scope,id);
}
