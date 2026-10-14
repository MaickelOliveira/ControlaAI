export type GoogleAgendaSyncState="queued"|"running"|"waiting"|"succeeded"|"failed"|"local"|"legacy";
export type GoogleAgendaAppointment=Readonly<{id:string;title:string;description?:string;location?:string;startAt:string;endAt?:string;allDay:boolean;repeat:"none"|"daily"|"weekly"|"monthly"|"yearly";status:"scheduled"|"done"|"cancelled";source:string;createdAt:string;meetLink?:string;ataGenerated?:boolean;ataContent?:string;googleSyncVersion:string|null;googleSyncState:GoogleAgendaSyncState;googleSyncFailureCode:string|null;googleMeetPending:boolean;googleCancellationPending:boolean}>;
const STATES=["queued","running","waiting","succeeded","failed","local","legacy"];
const FAILURES=["TEMPORARY","FOREIGN_EVENT","REMOTE_MISSING","CONFERENCE_FAILED","CONNECTION_CHANGED","ATTEMPTS_EXHAUSTED","ETAG_CONFLICT","SUPERSEDED"];
export function googleAgendaSyncVersion(value:unknown):string|null{
 if(value===null)return null;if(typeof value!=="string"||!/^v1:(?:0|[1-9]\d{0,18}):(?:0|[1-9]\d{0,18}):(?:0|[1-9]\d{0,18})$/.test(value)||value.slice(3).split(":").some(value=>BigInt(value)>BigInt("9223372036854775807")))throw Error("AGENDA_RESPONSE_INVALID");return value;
}
export function safeGoogleMeetHref(value:unknown):string|null{
 try{if(typeof value!=="string"||!value||value.length>1024)return null;const url=new URL(value);return url.protocol==="https:"&&url.hostname==="meet.google.com"&&!url.username&&!url.password&&!url.port&&!url.hash&&/^\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/.test(url.pathname)?url.href:null;}catch{return null;}
}
export function googleAgendaAppointment(value:unknown):GoogleAgendaAppointment{
 if(!value||typeof value!=="object"||Array.isArray(value))throw Error("AGENDA_RESPONSE_INVALID");const row=value as Record<string,unknown>;
 const string=(key:string,max:number,optional=false)=>{const value=row[key];if(optional&&value==null)return undefined;if(typeof value!=="string"||value.length>max)throw Error("AGENDA_RESPONSE_INVALID");return value;};
 const id=string("id",36)!;if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)||!STATES.includes(row.googleSyncState as string)||typeof row.allDay!=="boolean"||typeof row.googleMeetPending!=="boolean"||typeof row.googleCancellationPending!=="boolean"||!["scheduled","done","cancelled"].includes(row.status as string)||!["none","daily","weekly","monthly","yearly"].includes(row.repeat as string))throw Error("AGENDA_RESPONSE_INVALID");
 const syncVersion=googleAgendaSyncVersion(row.googleSyncVersion),state=row.googleSyncState as GoogleAgendaSyncState;
 if(row.googleSyncFailureCode!==null&&!FAILURES.includes(row.googleSyncFailureCode as string))throw Error("AGENDA_RESPONSE_INVALID");
 if(state==="local"||state==="legacy"){if(syncVersion!==null||row.googleMeetPending||row.googleCancellationPending||row.googleSyncFailureCode!==null)throw Error("AGENDA_RESPONSE_INVALID");}
 else if(syncVersion===null)throw Error("AGENDA_RESPONSE_INVALID");
 if(row.googleCancellationPending&&row.status!=="cancelled")throw Error("AGENDA_RESPONSE_INVALID");
 const startAt=string("startAt",64)!,endAt=string("endAt",64,true),createdAt=string("createdAt",64)!;
 if(!Number.isFinite(Date.parse(startAt))||endAt!==undefined&&!Number.isFinite(Date.parse(endAt))||!Number.isFinite(Date.parse(createdAt)))throw Error("AGENDA_RESPONSE_INVALID");
 if(row.ataGenerated!==undefined&&typeof row.ataGenerated!=="boolean")throw Error("AGENDA_RESPONSE_INVALID");
 return Object.freeze({id,title:string("title",2048)!,description:string("description",20000,true),location:string("location",2048,true),startAt,endAt,allDay:row.allDay,repeat:row.repeat as GoogleAgendaAppointment["repeat"],status:row.status as GoogleAgendaAppointment["status"],source:string("source",32)!,createdAt,meetLink:string("meetLink",1024,true),ataGenerated:row.ataGenerated as boolean|undefined,ataContent:string("ataContent",1_000_000,true),googleSyncVersion:syncVersion,googleSyncState:state,googleSyncFailureCode:row.googleSyncFailureCode as string|null,googleMeetPending:row.googleMeetPending,googleCancellationPending:row.googleCancellationPending});
}
export function googleAgendaAppointments(value:unknown):readonly GoogleAgendaAppointment[]{
 if(!Array.isArray(value)||value.length>10000)throw Error("AGENDA_RESPONSE_INVALID");const ids=new Set<string>();return Object.freeze(value.map(googleAgendaAppointment).filter(row=>{if(ids.has(row.id))throw Error("AGENDA_RESPONSE_INVALID");ids.add(row.id);return row.status!=="cancelled"||row.googleCancellationPending;}));
}
