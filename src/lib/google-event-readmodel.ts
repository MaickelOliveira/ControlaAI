import "server-only";
import {getSupabase} from "./supabase";
import {googleWorkspaceKey,type GoogleWorkspace} from "./google-workspace-policy";
import {googleOAuthBindingVersion} from "./google-oauth-state";
const STATES=["queued","running","waiting","succeeded","failed","local","legacy"] as const;
const FAILURES=["TEMPORARY","FOREIGN_EVENT","REMOTE_MISSING","CONFERENCE_FAILED","CONNECTION_CHANGED","ATTEMPTS_EXHAUSTED","ETAG_CONFLICT","SUPERSEDED"] as const;
export type GoogleEventReadSync=Readonly<{google_sync_version:string|null;google_sync_state:typeof STATES[number];google_sync_failure_code:typeof FAILURES[number]|null;google_meet_pending:boolean;google_cancellation_pending:boolean}>;
type CommonRow=Readonly<{id:string;user_id:string;company_id:string|null;workspace_legacy:boolean;title:string;description:string|null;start_at:string;end_at:string|null;
 source:"web"|"whatsapp";created_at:string;meet_link:string|null;calendar_event_id:string|null;ata_generated:boolean;ata_content:string|null;ata_notified_at:string|null}>;
export type GoogleAppointmentRow=Readonly<CommonRow&GoogleEventReadSync&{location:string|null;all_day:boolean;repeat:"none"|"daily"|"weekly"|"monthly"|"yearly";status:"scheduled"|"done"|"cancelled";reminder_sent_at:string|null;reminder_15min_sent_at:string|null}>;
export type GoogleMeetRow=Readonly<CommonRow&GoogleEventReadSync&{end_at:string;meet_link:string;calendar_event_id:string;status:"scheduled"|"ended"|"cancelled";attendees:readonly Readonly<{name:string;phone?:string;email?:string}>[]}>;
type Query=Readonly<{eventId?:string|null;limit?:number}>;
const COMMON=["id","user_id","company_id","workspace_legacy","title","description","start_at","end_at","source","created_at","meet_link","calendar_event_id","ata_generated","ata_content","ata_notified_at",
 "google_sync_version","google_sync_state","google_sync_failure_code","google_meet_pending","google_cancellation_pending"];
function object(value:unknown):Record<string,unknown>{if(!value||typeof value!=="object"||Array.isArray(value))throw Error();return value as Record<string,unknown>;}
function uuid(value:unknown):string{if(typeof value!=="string"||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value))throw Error();return value.toLowerCase();}
function text(value:unknown,nullable=false):string|null{if(nullable&&value===null)return null;if(typeof value!=="string")throw Error();return value;}
function time(value:unknown,nullable=false):string|null{if(nullable&&value===null)return null;if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}T/.test(value)||!Number.isFinite(Date.parse(value)))throw Error();return value;}
function boolean(value:unknown):boolean{if(typeof value!=="boolean")throw Error();return value;}
function sync(value:Record<string,unknown>):GoogleEventReadSync{
 const state=STATES.find(item=>item===value.google_sync_state),failure=FAILURES.find(code=>code===value.google_sync_failure_code)??null;
 if(!state||(value.google_sync_failure_code!==null&&failure===null))throw Error();
 const revision=value.google_sync_version;
 if(state==="local"||state==="legacy"){
  if(revision!==null||failure!==null||value.google_meet_pending!==false||value.google_cancellation_pending!==false)throw Error();
 }else{
  if(typeof revision!=="string"||!/^v1:(?:0|[1-9]\d*):(?:0|[1-9]\d*):(?:0|[1-9]\d*)$/.test(revision))throw Error();
  for(const part of revision.split(":").slice(1))googleOAuthBindingVersion(part);
  if(state==="failed"&&!failure||["running","waiting","succeeded"].includes(state)&&failure)throw Error();
 }
 const meetPending=boolean(value.google_meet_pending),cancellationPending=boolean(value.google_cancellation_pending);
 if(meetPending&&!["queued","running","waiting"].includes(state)||state==="waiting"&&!meetPending
  ||cancellationPending&&(value.status!=="cancelled"||!["queued","running","waiting","failed"].includes(state)))throw Error();
 return Object.freeze({google_sync_version:revision as string|null,google_sync_state:state,google_sync_failure_code:failure,google_meet_pending:meetPending,google_cancellation_pending:cancellationPending});
}
function row(scope:GoogleWorkspace,kind:"appointment"|"meet",value:unknown,eventId:string|null):GoogleAppointmentRow|GoogleMeetRow{
 const source=object(value),extra=kind==="appointment"?["location","all_day","repeat","reminder_sent_at","reminder_15min_sent_at"]:["attendees"];
 if(Object.keys(source).some(key=>![...COMMON,...extra,"status"].includes(key)))throw Error();
 const id=uuid(source.id),owner=uuid(source.user_id),company=source.company_id===null?null:uuid(source.company_id),legacy=boolean(source.workspace_legacy),metadata=sync(source);
 if(owner!==scope.userId||(eventId!==null&&id!==eventId)||(scope.mode==="business"?company!==scope.companyId:company!==null&&!legacy)
  ||(eventId===null&&source.status==="cancelled"&&!metadata.google_cancellation_pending))throw Error();
 if(legacy&&metadata.google_sync_state!=="legacy")throw Error();
 const common={id,user_id:owner,company_id:company,workspace_legacy:legacy,title:text(source.title)!,description:text(source.description,true),start_at:time(source.start_at)!,end_at:time(source.end_at,true),
  source:source.source,created_at:time(source.created_at)!,meet_link:text(source.meet_link,true),calendar_event_id:text(source.calendar_event_id,true),ata_generated:boolean(source.ata_generated),ata_content:text(source.ata_content,true),ata_notified_at:time(source.ata_notified_at,true),...metadata};
 if(common.source!=="web"&&common.source!=="whatsapp")throw Error();
 if(kind==="appointment"){
  const status=source.status,repeat=source.repeat;if(status!=="scheduled"&&status!=="done"&&status!=="cancelled"||repeat!=="none"&&repeat!=="daily"&&repeat!=="weekly"&&repeat!=="monthly"&&repeat!=="yearly")throw Error();
  return Object.freeze({...common,source:common.source,status,repeat,location:text(source.location,true),all_day:boolean(source.all_day),reminder_sent_at:time(source.reminder_sent_at,true),reminder_15min_sent_at:time(source.reminder_15min_sent_at,true)});
 }
 const status=source.status;if(status!=="scheduled"&&status!=="ended"&&status!=="cancelled"||!Array.isArray(source.attendees)||source.attendees.length>1000||common.end_at===null||common.meet_link===null||common.calendar_event_id===null)throw Error();
 const attendees=Object.freeze(source.attendees.map(value=>{const entry=object(value);if(Object.keys(entry).some(key=>!["name","phone","email"].includes(key)))throw Error();return Object.freeze({name:text(entry.name)!,...(entry.phone===undefined?{}:{phone:text(entry.phone)!}),...(entry.email===undefined?{}:{email:text(entry.email)!})});}));
 return Object.freeze({...common,source:common.source,status,end_at:common.end_at,meet_link:common.meet_link,calendar_event_id:common.calendar_event_id,attendees});
}
async function read(scope:GoogleWorkspace,kind:"appointment"|"meet",options:Query):Promise<readonly (GoogleAppointmentRow|GoogleMeetRow)[]>{
 let selected:GoogleWorkspace,eventId:string|null,limit:number;
 try{googleWorkspaceKey(scope);selected=Object.freeze({userId:scope.userId.toLowerCase(),mode:scope.mode,companyId:scope.companyId?.toLowerCase()??null});
  const query=object(options);if(Object.keys(query).some(key=>!["eventId","limit"].includes(key)))throw Error();eventId=query.eventId==null?null:uuid(query.eventId);
  limit=query.limit===undefined?1000:query.limit as number;if(typeof limit!=="number"||!Number.isInteger(limit)||limit<1||limit>1000)throw Error();
 }catch{throw Error("GOOGLE_EVENT_READ_INVALID");}
 let data:unknown;
 try{const result=await getSupabase().rpc(kind==="appointment"?"zelo_google_appointment_rows":"zelo_google_meet_rows",{p_user_id:selected.userId,p_mode:selected.mode,p_company_id:selected.companyId,p_event_id:eventId,p_limit:limit});
  if(result.error)throw Error();data=result.data;
 }catch{throw Error("GOOGLE_EVENT_READ_UNAVAILABLE");}
 try{if(!Array.isArray(data)||data.length>limit||(eventId!==null&&data.length>1))throw Error();const seen=new Set<string>();
  return Object.freeze(data.map(value=>{const result=row(selected,kind,value,eventId);if(seen.has(result.id))throw Error();seen.add(result.id);return result;}));
 }catch{throw Error("GOOGLE_EVENT_READ_STORAGE_INVALID");}
}
/** Authenticated owner/workspace only. One RPC captures local data and Google
 * synchronization version together; history is never provider authorization. */
export async function loadGoogleAppointmentRows(scope:GoogleWorkspace,options:Query={}):Promise<readonly GoogleAppointmentRow[]>{return await read(scope,"appointment",options) as readonly GoogleAppointmentRow[];}
export async function loadGoogleMeetRows(scope:GoogleWorkspace,options:Query={}):Promise<readonly GoogleMeetRow[]>{return await read(scope,"meet",options) as readonly GoogleMeetRow[];}
