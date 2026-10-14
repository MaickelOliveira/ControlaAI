import "server-only";
import {createHmac,timingSafeEqual} from "node:crypto";
import {googleEventOriginFromStorage,googleEventRetryIdentity} from "./google-event-policy";
import {googleOAuthBindingVersion} from "./google-oauth-state";
import type {GoogleEventIntent} from "./google-event-origin-store";
import {googleEventCommandIdentity,type GoogleEventCommandKind} from "./google-event-command-policy";
export type GoogleEventProviderMarkers=Readonly<{zeloOrigin:string;zeloCreation:string}>;
export type GoogleEventCommandMarkerContext=Readonly<{operationId:string;headVersion:string;kind:GoogleEventCommandKind;payloadFingerprint:string;conferenceRequestId:string|null}>;
const HEX=/^[a-f0-9]{64}$/;
function hex(value:unknown):string{if(typeof value!=="string"||value.length!==64||!HEX.test(value))throw Error();return value;}
function context(intent:GoogleEventIntent,fingerprint:string,withMeet:boolean){
 try{
  const origin=googleEventOriginFromStorage(intent.workspace,intent.eventId,{event_id:intent.eventId,user_id:intent.workspace.userId,mode:intent.workspace.mode,company_id:intent.workspace.companyId,binding_id:intent.bindingId,grant_id:intent.grantId,calendar_id:intent.calendarId,remote_event_id:intent.remoteEventId});
  const ids=googleEventRetryIdentity(origin.workspace,origin.eventId),version=googleOAuthBindingVersion(intent.bindingVersion);
  if(version==="0"||origin.remoteEventId!==ids.remoteEventId||intent.conferenceRequestId!==ids.conferenceRequestId||typeof withMeet!=="boolean")throw Error();
  return {origin:[origin.workspace.userId,origin.workspace.mode,origin.workspace.companyId,origin.eventId,origin.bindingId,origin.grantId,version,origin.calendarId,origin.remoteEventId],operation:[hex(fingerprint),withMeet,ids.conferenceRequestId]};
 }catch{throw Error("GOOGLE_EVENT_MARKER_INVALID");}
}
/** Sign only a validated persisted intent/payload digest loaded by the trusted
 * server. HMACs contain no credentials or raw owner/event data. This never selects
 * credentials or grants access; the scoped runtime still authorizes every effect. */
export function googleEventProviderMarkers(intent:GoogleEventIntent,fingerprint:string,withMeet:boolean):GoogleEventProviderMarkers{
 const captured=context(intent,fingerprint,withMeet),secret=process.env.DATA_ENCRYPTION_KEY;
 if(!secret)throw Error("GOOGLE_EVENT_MARKER_UNAVAILABLE");
 try{
  // Independent key/domain from existing AES-GCM storage; no key rotation/change.
  const key=createHmac("sha256",secret).update("zelo-google-event-marker-key-v1").digest();
  const sign=(domain:string,fields:unknown)=>createHmac("sha256",key).update(domain+"\0"+JSON.stringify(fields)).digest("hex");
  return Object.freeze({zeloOrigin:sign("zelo-google-origin-v1",captured.origin),zeloCreation:sign("zelo-google-creation-v1",[captured.origin,captured.operation])});
 }catch{throw Error("GOOGLE_EVENT_MARKER_UNAVAILABLE");}
}
/** Verify the private properties on the exact original calendar/event returned
 * by Google. A409, readable ID or copied unverified metadata is insufficient. */
export function assertGoogleEventProviderMarkers(intent:GoogleEventIntent,fingerprint:string,withMeet:boolean,value:unknown):void{
 const expected=googleEventProviderMarkers(intent,fingerprint,withMeet);
 try{
  if(!value||typeof value!=="object"||Array.isArray(value))throw Error();const row=value as Record<string,unknown>;
  for(const name of ["zeloOrigin","zeloCreation"] as const){if(!timingSafeEqual(Buffer.from(hex(row[name]),"hex"),Buffer.from(expected[name],"hex")))throw Error();}
 }catch{throw Error("GOOGLE_EVENT_MARKER_INVALID");}
}
/** A separate persisted mutation marker leaves immutable creation markers intact.
 * Its opaque signature is never a permission check or a provider payload check. */
export function googleEventCommandMarker(intent:GoogleEventIntent,command:GoogleEventCommandMarkerContext):string{
 let captured:unknown;
 try{
  const original=context(intent,command.payloadFingerprint,false),version=googleOAuthBindingVersion(command.headVersion);
  const requestId=googleEventCommandIdentity(intent.workspace,intent.eventId,command.operationId);
  if(version==="0"||!["update","delete","conference"].includes(command.kind)||(command.kind==="conference"?command.conferenceRequestId!==requestId:command.conferenceRequestId!==null))throw Error();
  captured=[original.origin,command.operationId.toLowerCase(),version,command.kind,hex(command.payloadFingerprint),command.conferenceRequestId];
 }catch{throw Error("GOOGLE_EVENT_COMMAND_MARKER_INVALID");}
 const secret=process.env.DATA_ENCRYPTION_KEY;if(!secret)throw Error("GOOGLE_EVENT_MARKER_UNAVAILABLE");
 try{const key=createHmac("sha256",secret).update("zelo-google-event-marker-key-v1").digest();return createHmac("sha256",key).update("zelo-google-command-v1\0"+JSON.stringify(captured)).digest("hex");}
 catch{throw Error("GOOGLE_EVENT_MARKER_UNAVAILABLE");}
}
export function assertGoogleEventCommandMarker(intent:GoogleEventIntent,command:GoogleEventCommandMarkerContext,value:unknown):void{
 const expected=googleEventCommandMarker(intent,command);
 try{if(!value||typeof value!=="object"||Array.isArray(value))throw Error();
  if(!timingSafeEqual(Buffer.from(hex((value as Record<string,unknown>).zeloCommand),"hex"),Buffer.from(expected,"hex")))throw Error();
 }catch{throw Error("GOOGLE_EVENT_COMMAND_MARKER_INVALID");}
}
