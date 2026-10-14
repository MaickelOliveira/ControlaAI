import "server-only";
import {google,type calendar_v3} from "googleapis";
import {loadGoogleBinding,type GoogleBinding} from "./google-binding-store";
import {withGoogleWorkspaceClient} from "./google-workspace-runtime";
import {googleEventOperationTarget} from "./google-event-policy";
import {googleEventCommandIdentity,googleEventChangeBody,googleEventChangeMatches} from "./google-event-command-policy";
import {assertGoogleEventProviderMarkers,googleEventProviderMarkers,assertGoogleEventCommandMarker,googleEventCommandMarker} from "./google-event-marker";
import {loadGoogleEventCommand,loadGoogleEventCommandHead,claimGoogleEventCommand,finishGoogleEventCommand,assertGoogleEventCommandActive,assertGoogleEventCommandLease,type GoogleEventCommand,type GoogleEventCommandOutcome} from "./google-event-command-store";
import type {GoogleWorkspace} from "./google-workspace-policy";
export type GoogleEventCommandStatus=Readonly<{eventId:string;operationId:string;state:GoogleEventCommand["state"];meetLink:string|null;failureCode:GoogleEventCommand["failureCode"]}>;
class CommandGuardError extends Error{}
const OPTIONS={timeout:15000,retry:false} as const;
function status(command:GoogleEventCommand):GoogleEventCommandStatus{return Object.freeze({eventId:command.intent.eventId,operationId:command.operationId,state:command.state,meetLink:command.meetLink,failureCode:command.failureCode});}
function object(value:unknown):Record<string,unknown>|null{return value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:null;}
function httpStatus(error:unknown):number|null{if(!error||typeof error!=="object")return null;const row=error as {response?:{status?:unknown};code?:unknown};return typeof row.response?.status==="number"?row.response.status:typeof row.code==="number"?row.code:null;}
function failed(code:NonNullable<GoogleEventCommandOutcome["failureCode"]>,etag:string|null=null):GoogleEventCommandOutcome{return {result:"failed",etag,meetLink:null,failureCode:code};}
function succeeded(etag:string|null=null,meetLink:string|null=null):GoogleEventCommandOutcome{return {result:"succeeded",etag,meetLink,failureCode:null};}
function owned(command:GoogleEventCommand,value:unknown):Record<string,unknown>|null{
 try{const event=object(value);if(!event||event.id!==command.intent.remoteEventId||typeof event.etag!=="string"||!event.etag||event.etag.length>1024||/\p{Cc}/u.test(event.etag))throw Error();
  assertGoogleEventProviderMarkers(command.intent,command.creationFingerprint,command.creationWithMeet,object(event.extendedProperties)?.private);return event;
 }catch(error){if(error instanceof Error&&error.message==="GOOGLE_EVENT_MARKER_UNAVAILABLE")throw error;return null;}
}
function applied(command:GoogleEventCommand,event:Record<string,unknown>):boolean{
 try{assertGoogleEventCommandMarker(command.intent,command,object(event.extendedProperties)?.private);return true;}
 catch(error){if(error instanceof Error&&error.message==="GOOGLE_EVENT_MARKER_UNAVAILABLE")throw error;return false;}
}
function observed(command:GoogleEventCommand,event:Record<string,unknown>):GoogleEventCommandOutcome{
 const etag=event.etag as string;
 if(event.status==="cancelled")return command.kind==="delete"?succeeded():failed("REMOTE_MISSING");
 if(event.status!=="confirmed"&&event.status!=="tentative")return failed("FOREIGN_EVENT");
 if(command.kind==="update")return command.payload&&googleEventChangeMatches(command.payload,event)?succeeded(etag):failed("ETAG_CONFLICT");
 const conference=object(event.conferenceData),request=object(conference?.createRequest),requestStatus=object(request?.status)?.statusCode;
 if(!conference||(conference.createRequest!=null&&!request)||(request&&request.requestId!==command.conferenceRequestId))return failed("CONFERENCE_FAILED",etag);
 if(requestStatus==="pending")return {result:"waiting",etag,meetLink:null,failureCode:null};
 if(requestStatus==="failure"||(request&&requestStatus!=="success"))return failed("CONFERENCE_FAILED",etag);
 const points=conference.entryPoints;if(!Array.isArray(points)||!points.every(point=>object(point)!==null))return failed("CONFERENCE_FAILED",etag);
 const entries=points.map(point=>object(point)!).filter(point=>point.entryPointType==="video"),link=entries[0]?.uri;
 if(object(object(conference.conferenceSolution)?.key)?.type!=="hangoutsMeet"||entries.length!==1||typeof link!=="string"||/\p{Cc}/u.test(link)||!/^https:\/\/meet[.]google[.]com\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/.test(link))return failed("CONFERENCE_FAILED",etag);
 return succeeded(etag,link);
}
async function guard(scope:GoogleWorkspace,command:GoogleEventCommand,runtime:GoogleBinding,clientId:string):Promise<void>{
 try{const current=await loadGoogleEventCommand(scope,command.intent.eventId,command.operationId),head=await loadGoogleEventCommandHead(scope,command.intent.eventId),binding=await loadGoogleBinding(scope);
  googleEventOperationTarget(scope,command.intent.eventId,command.intent,binding);
  if(!current||!head||head.deleted||head.version!==command.headVersion||head.operationId!==command.operationId||!current.lease||!command.lease||current.state!=="running"
   ||current.attemptVersion!==command.attemptVersion||current.headVersion!==command.headVersion||current.lease.id!==command.lease.id||current.lease.bindingVersion!==runtime.version
   ||current.payloadFingerprint!==command.payloadFingerprint||JSON.stringify(current.payload)!==JSON.stringify(command.payload)||JSON.stringify(current.intent)!==JSON.stringify(command.intent)
   ||current.creationFingerprint!==command.creationFingerprint||binding?.version!==runtime.version||Date.parse(current.lease.expiresAt)<=Date.now()+16000)throw Error();
  await assertGoogleEventCommandLease(scope,command,runtime,clientId);
 }catch{throw new CommandGuardError();}
}
/** Explicit persisted command only. No global fallback, origin inference,
 * automatic ETag adoption, new conference identity or local metadata mutation. */
export async function synchronizeGoogleEventCommand(scope:GoogleWorkspace,eventId:string,operationId:string):Promise<GoogleEventCommandStatus>{
 try{
  googleEventCommandIdentity(scope,eventId,operationId);const selected=Object.freeze({userId:scope.userId.toLowerCase(),mode:scope.mode,companyId:scope.companyId?.toLowerCase()??null}),event=eventId.toLowerCase(),operation=operationId.toLowerCase();
  const pending=await loadGoogleEventCommand(selected,event,operation);if(!pending)throw Error();
  if(pending.state==="succeeded"||pending.state==="failed"||(pending.lease&&Date.parse(pending.lease.expiresAt)>Date.now()))return status(pending);
  if(pending.roundAttempts>=10)return Object.freeze({...status(pending),state:"failed",failureCode:"ATTEMPTS_EXHAUSTED"});
  await assertGoogleEventCommandActive(selected,event,operation);
  const markers={...googleEventProviderMarkers(pending.intent,pending.creationFingerprint,pending.creationWithMeet),zeloCommand:googleEventCommandMarker(pending.intent,pending)};
  return await withGoogleWorkspaceClient(selected,{bindingId:pending.intent.bindingId,grantId:pending.intent.grantId},async(auth,binding)=>{
   if(typeof auth._clientId!=="string")throw Error();const clientId=auth._clientId,claimed=await claimGoogleEventCommand(selected,event,operation,binding,clientId,pending.attemptVersion);
   if(!claimed.lease||claimed.headVersion!==pending.headVersion||claimed.payloadFingerprint!==pending.payloadFingerprint||JSON.stringify(claimed.payload)!==JSON.stringify(pending.payload))throw Error();
   const calendar=google.calendar({version:"v3",auth});let outcome:GoogleEventCommandOutcome;
   try{
    await guard(selected,claimed,binding,clientId);
    const value=(await calendar.events.get({calendarId:claimed.intent.calendarId,eventId:claimed.intent.remoteEventId},OPTIONS)).data,event=owned(claimed,value);
    if(!event)outcome=failed("FOREIGN_EVENT");
    else if(event.status==="cancelled")outcome=claimed.kind==="delete"?succeeded():failed("REMOTE_MISSING");
    else if(event.status!=="confirmed"&&event.status!=="tentative")outcome=failed("FOREIGN_EVENT");
    else if(claimed.kind!=="delete"&&applied(claimed,event))outcome=observed(claimed,event);
    else if(event.etag!==claimed.expectedEtag)outcome=failed("ETAG_CONFLICT");
    else if(!claimed.lease.mutationAllowed)outcome=failed("CONNECTION_CHANGED");
    else{
     await guard(selected,claimed,binding,clientId);const options={...OPTIONS,headers:{"If-Match":claimed.expectedEtag}};
     if(claimed.kind==="delete"){
      await calendar.events.delete({calendarId:claimed.intent.calendarId,eventId:claimed.intent.remoteEventId,sendUpdates:"all"},options);outcome=succeeded();
     }else{
      const fields:calendar_v3.Schema$Event=claimed.kind==="update"&&claimed.payload?googleEventChangeBody(claimed.payload):{conferenceData:{createRequest:{requestId:claimed.conferenceRequestId!,conferenceSolutionKey:{type:"hangoutsMeet"}}}};
      const result=(await calendar.events.patch({calendarId:claimed.intent.calendarId,eventId:claimed.intent.remoteEventId,conferenceDataVersion:1,sendUpdates:"all",requestBody:{...fields,extendedProperties:{private:markers}}},options)).data;
      const verified=owned(claimed,result);outcome=verified&&applied(claimed,verified)?observed(claimed,verified):failed("FOREIGN_EVENT");
     }
    }
   }catch(error){
    if(error instanceof CommandGuardError||error instanceof Error&&error.message==="GOOGLE_EVENT_MARKER_UNAVAILABLE")throw error;
    const code=httpStatus(error);outcome=code===404||code===410?claimed.kind==="delete"?succeeded():failed("REMOTE_MISSING"):code===412?failed("ETAG_CONFLICT"):code===401||code===403?failed("CONNECTION_CHANGED"):{result:"retry",etag:null,meetLink:null,failureCode:"TEMPORARY"};
   }
   return status(await finishGoogleEventCommand(selected,event,operation,binding,clientId,claimed.attemptVersion,claimed.lease,outcome));
  });
 }catch{throw Error("GOOGLE_EVENT_SYNC_UNAVAILABLE");}
}
