import "server-only";
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
export type GoogleEventExpectation=Readonly<{clientMutationId:string;expectedGoogleSyncVersion:string|null}>;
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
