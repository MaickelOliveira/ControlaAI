import "server-only";
import {google,type calendar_v3} from "googleapis";
import {loadGoogleBinding,type GoogleBinding} from "./google-binding-store";
import {withGoogleWorkspaceClient} from "./google-workspace-runtime";
import {googleEventOperationTarget,googleEventRetryIdentity} from "./google-event-policy";
import {assertGoogleEventProviderMarkers,googleEventProviderMarkers} from "./google-event-marker";
import {claimGoogleEventCreation,finishGoogleEventCreation,loadGoogleEventCreation,type GoogleEventCreation,type GoogleEventCreationOutcome} from "./google-event-creation-store";
import {assertGoogleLocalEventActive,assertGoogleLocalEventLease} from "./google-event-local-store";
import type {GoogleWorkspace} from "./google-workspace-policy";
export type GoogleEventCreationStatus=Readonly<{eventId:string;state:GoogleEventCreation["state"];meetLink:string|null;failureCode:GoogleEventCreation["failureCode"]}>;
class CreationGuardError extends Error{}
const OPTIONS={timeout:15000,retry:false} as const;
function status(value:GoogleEventCreation):GoogleEventCreationStatus{return Object.freeze({eventId:value.intent.eventId,state:value.state,meetLink:value.meetLink,failureCode:value.failureCode});}
function httpStatus(error:unknown):number|null{
 if(!error||typeof error!=="object")return null;const value=error as {response?:{status?:unknown};code?:unknown};
 return typeof value.response?.status==="number"?value.response.status:typeof value.code==="number"?value.code:null;
}
function failed(creation:GoogleEventCreation,code:NonNullable<GoogleEventCreationOutcome["failureCode"]>):GoogleEventCreationOutcome{
 return {result:"failed",remoteKnown:creation.remoteKnown,etag:creation.etag,meetLink:null,failureCode:code};
}
function temporary(creation:GoogleEventCreation):GoogleEventCreationOutcome{return {...failed(creation,"TEMPORARY"),result:"retry"};}
async function guard(scope:GoogleWorkspace,creation:GoogleEventCreation,runtime:GoogleBinding,clientId:string):Promise<void>{
 try{
  const current=await loadGoogleEventCreation(scope,creation.intent.eventId),binding=await loadGoogleBinding(scope);
  googleEventOperationTarget(scope,creation.intent.eventId,creation.intent,binding);
  if(!current||!current.lease||!creation.lease||current.state!=="running"||current.attemptVersion!==creation.attemptVersion
   ||current.lease.id!==creation.lease.id||current.payloadFingerprint!==creation.payloadFingerprint||current.lease.bindingVersion!==runtime.version
   ||binding?.version!==runtime.version||Date.parse(current.lease.expiresAt)<=Date.now()+16000)throw Error();
  await assertGoogleLocalEventLease(scope,creation,runtime,clientId);
 }catch{throw new CreationGuardError();}
}
function body(creation:GoogleEventCreation,markers:ReturnType<typeof googleEventProviderMarkers>):calendar_v3.Schema$Event{
 const payload=creation.payload;
 const time=(value:string)=>payload.allDay?{date:value,...(payload.repeat!=="none"?{timeZone:"America/Sao_Paulo"}:{})}:{dateTime:value,timeZone:"America/Sao_Paulo"};
 return {id:creation.intent.remoteEventId,summary:payload.summary,description:payload.description,location:payload.location,start:time(payload.startAt),end:time(payload.endAt),
  recurrence:payload.repeat==="none"?undefined:["RRULE:FREQ="+payload.repeat.toUpperCase()],attendees:payload.attendees.map(attendee=>({...attendee})),extendedProperties:{private:{...markers}},
  ...(payload.withMeet?{conferenceData:{createRequest:{requestId:creation.intent.conferenceRequestId,conferenceSolutionKey:{type:"hangoutsMeet"}}}}:{})};
}
function object(value:unknown):Record<string,unknown>|null{return value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:null;}
function observed(creation:GoogleEventCreation,value:unknown):GoogleEventCreationOutcome{
 const event=object(value);
 try{
  if(!event||event.id!==creation.intent.remoteEventId)throw Error();
  assertGoogleEventProviderMarkers(creation.intent,creation.payloadFingerprint,creation.payload.withMeet,object(event.extendedProperties)?.private);
  if(typeof event.etag!=="string"||!event.etag||event.etag.length>1024||/\p{Cc}/u.test(event.etag))throw Error();
 }catch(error){
  if(error instanceof Error&&error.message==="GOOGLE_EVENT_MARKER_UNAVAILABLE")throw error;
  return failed(creation,"FOREIGN_EVENT");
 }
 const verified=event!;
 const known={remoteKnown:true,etag:verified.etag as string,meetLink:null};
 if(verified.status==="cancelled")return {...known,result:"failed",failureCode:"REMOTE_MISSING"};
 if(verified.status!=="confirmed"&&verified.status!=="tentative")return {...known,result:"failed",failureCode:"FOREIGN_EVENT"};
 if(!creation.payload.withMeet)return {...known,result:"succeeded",failureCode:null};
 const conference=object(verified.conferenceData),request=object(conference?.createRequest),requestStatus=object(request?.status)?.statusCode;
 const invalid=()=>({...known,result:"failed" as const,failureCode:"CONFERENCE_FAILED" as const});
 if(!conference||(conference.createRequest!=null&&!request)||(request&&request.requestId!==creation.intent.conferenceRequestId))return invalid();
 if(requestStatus==="pending")return {...known,result:"waiting",failureCode:null};
 if(requestStatus==="failure"||(request&&requestStatus!=="success"))return invalid();
 const points=conference.entryPoints;
 if(!Array.isArray(points)||!points.every(point=>object(point)!==null))return invalid();
 const entries=points.map(point=>object(point)!).filter(point=>point.entryPointType==="video"),link=entries[0]?.uri;
 if(object(object(conference.conferenceSolution)?.key)?.type!=="hangoutsMeet"||entries.length!==1
  ||typeof link!=="string"||/\p{Cc}/u.test(link)||!/^https:\/\/meet[.]google[.]com\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/.test(link))return {...known,result:"failed",failureCode:"CONFERENCE_FAILED"};
 return {...known,result:"succeeded",meetLink:link,failureCode:null};
}
/** Trusted authenticated workspace and authorized persisted logical event only.
 * No production caller yet. No public-row creation, default calendar/legacy lookup,
 * conference patch or implicit user retry. Real SDK requests use the scoped runtime
 * and original target; only fixed status metadata leaves this server adapter. */
export async function synchronizeGoogleEventCreation(scope:GoogleWorkspace,eventId:string):Promise<GoogleEventCreationStatus>{
 try{
  googleEventRetryIdentity(scope,eventId);const selected=Object.freeze({userId:scope.userId.toLowerCase(),mode:scope.mode,companyId:scope.companyId?.toLowerCase()??null}),id=eventId.toLowerCase();
  const pending=await loadGoogleEventCreation(selected,id);if(!pending)throw Error();
  if(pending.state==="succeeded"||pending.state==="failed"||(pending.lease&&Date.parse(pending.lease.expiresAt)>Date.now()))return status(pending);
  if(pending.roundAttempts>=10)return Object.freeze({...status(pending),state:"failed",failureCode:"ATTEMPTS_EXHAUSTED"});
  await assertGoogleLocalEventActive(selected,id);
  const markers=googleEventProviderMarkers(pending.intent,pending.payloadFingerprint,pending.payload.withMeet);
  return await withGoogleWorkspaceClient(selected,{bindingId:pending.intent.bindingId,grantId:pending.intent.grantId},async(auth,binding)=>{
   if(typeof auth._clientId!=="string")throw Error();const clientId=auth._clientId;
   const claimed=await claimGoogleEventCreation(selected,id,binding,clientId,pending.attemptVersion);
   if(!claimed.lease||claimed.payloadFingerprint!==pending.payloadFingerprint||JSON.stringify(claimed.payload)!==JSON.stringify(pending.payload))throw Error();
   const calendar=google.calendar({version:"v3",auth});
   const get=async()=>{await guard(selected,claimed,binding,clientId);return (await calendar.events.get({calendarId:claimed.intent.calendarId,eventId:claimed.intent.remoteEventId},OPTIONS)).data;};
   let outcome:GoogleEventCreationOutcome;
   try{
    let event:calendar_v3.Schema$Event|null,missing=false;
    try{event=await get();}catch(error){if(error instanceof CreationGuardError||httpStatus(error)!==404)throw error;missing=true;event=null;}
    if(missing){
     if(claimed.remoteKnown)outcome=failed(claimed,"REMOTE_MISSING");
     else if(!claimed.lease.insertAllowed)outcome=failed(claimed,"CONNECTION_CHANGED");
     else{
      await guard(selected,claimed,binding,clientId);
      try{event=(await calendar.events.insert({calendarId:claimed.intent.calendarId,conferenceDataVersion:claimed.payload.withMeet?1:0,
       sendUpdates:claimed.payload.attendees.length?"all":"none",requestBody:body(claimed,markers)},OPTIONS)).data;}
      catch(error){if(httpStatus(error)!==409)throw error;event=await get();}
      outcome=observed(claimed,event);
     }
    }else outcome=observed(claimed,event);
   }catch(error){
    if(error instanceof CreationGuardError||error instanceof Error&&error.message==="GOOGLE_EVENT_MARKER_UNAVAILABLE")throw error;
    const code=httpStatus(error);outcome=code===410?failed(claimed,"REMOTE_MISSING"):code===401||code===403?failed(claimed,"CONNECTION_CHANGED"):temporary(claimed);
   }
   return status(await finishGoogleEventCreation(selected,id,binding,clientId,claimed.attemptVersion,claimed.lease,outcome));
  });
 }catch{throw Error("GOOGLE_EVENT_SYNC_UNAVAILABLE");}
}
