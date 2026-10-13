import {createHash} from "node:crypto";
import type {GoogleBinding} from "./google-binding-store";
import {assertGoogleWorkspaceMatch,googleWorkspaceKey,type GoogleWorkspace} from "./google-workspace-policy";

export type GoogleEventOrigin=Readonly<{workspace:GoogleWorkspace;eventId:string;bindingId:string;grantId:string;calendarId:string;remoteEventId:string}>;
export type GoogleEventRetryIdentity=Readonly<{remoteEventId:string;conferenceRequestId:string}>;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function record(value:unknown):Record<string,unknown>{if(!value||typeof value!=="object"||Array.isArray(value))throw Error();return value as Record<string,unknown>;}
function uuid(value:unknown):string{if(typeof value!=="string"||!UUID.test(value))throw Error();return value.toLowerCase();}
function calendar(value:unknown):string{if(typeof value!=="string"||!value.trim()||value.length>1024||/\p{Cc}/u.test(value))throw Error();return value;}
function remoteId(value:unknown):string{if(typeof value!=="string"||!/^[a-v0-9]{5,1024}$/.test(value))throw Error();return value;}
function workspace(value:unknown):GoogleWorkspace{
 const row=record(value);if(row.mode!=="personal"&&row.mode!=="business")throw Error();
 const result=Object.freeze({userId:uuid(row.userId),mode:row.mode,companyId:row.companyId===null?null:uuid(row.companyId)});
 googleWorkspaceKey(result);return result;
}
function origin(value:unknown):GoogleEventOrigin{
 const row=record(value);
 return Object.freeze({workspace:workspace(row.workspace),eventId:uuid(row.eventId),bindingId:uuid(row.bindingId),grantId:uuid(row.grantId),calendarId:calendar(row.calendarId),remoteEventId:remoteId(row.remoteEventId)});
}
/** This validates provenance already loaded from an authorized local record.
 * It never authenticates a body/model-provided owner, reference or context. */
export function googleEventOriginFromStorage(scope:GoogleWorkspace,eventId:string,value:unknown):GoogleEventOrigin{
 if(value===null||value===undefined)throw Error("GOOGLE_EVENT_ORIGIN_REQUIRED");
 try{
  const row=record(value),result=origin({workspace:{userId:row.user_id,mode:row.mode,companyId:row.company_id},eventId:row.event_id,bindingId:row.binding_id,grantId:row.grant_id,calendarId:row.calendar_id,remoteEventId:row.remote_event_id});
  assertGoogleWorkspaceMatch(scope,result.workspace);if(result.eventId!==uuid(eventId))throw Error();return result;
 }catch{throw Error("GOOGLE_EVENT_ORIGIN_INVALID");}
}
/** A server adapter must authorize the local event and recheck active storage
 * before any effect. Changing the selected calendar does not move an old event. */
export function googleEventOperationTarget(scope:GoogleWorkspace,eventId:string,stored:GoogleEventOrigin|null|undefined,binding:GoogleBinding|null):GoogleEventOrigin{
 if(stored===null||stored===undefined)throw Error("GOOGLE_EVENT_ORIGIN_REQUIRED");
 try{
  const result=origin(stored);assertGoogleWorkspaceMatch(scope,result.workspace);if(result.eventId!==uuid(eventId))throw Error();
  if(!binding||binding.unlinkedAt!==null)throw Error();
  assertGoogleWorkspaceMatch(scope,workspace(binding.workspace));
  if(uuid(binding.id)!==result.bindingId||uuid(binding.grantId)!==result.grantId)throw Error();
  return result;
 }catch{throw Error("GOOGLE_EVENT_ACCESS_DENIED");}
}
/** Persist these IDs with local intent before the first provider call. Every
 * retry of that logical event/first conference must reuse the persisted values. */
export function googleEventRetryIdentity(scope:GoogleWorkspace,eventId:string):GoogleEventRetryIdentity{
 try{
  const key=googleWorkspaceKey(scope)+"\0"+uuid(eventId);
  const hash=(domain:string)=>createHash("sha256").update(domain+"\0"+key).digest("hex");
  return Object.freeze({remoteEventId:hash("zelo-google-event-v1"),conferenceRequestId:hash("zelo-google-conference-v1")});
 }catch{throw Error("GOOGLE_EVENT_IDENTITY_INVALID");}
}
