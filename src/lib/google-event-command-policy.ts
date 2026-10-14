import {createHash} from "node:crypto";
import {googleWorkspaceKey,type GoogleWorkspace} from "./google-workspace-policy";
import {googleEventCreationPayload,type GoogleEventCreationPayload} from "./google-event-payload";
export type GoogleEventChangePayload=Readonly<Omit<GoogleEventCreationPayload,"withMeet">>;
export type GoogleEventCommandKind="update"|"delete"|"conference";
function uuid(value:unknown):string{if(typeof value!=="string"||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value))throw Error();return value.toLowerCase();}
function object(value:unknown):Record<string,unknown>|null{return value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:null;}
/** The caller already authorized the event/action. Neither this identity nor
 * payload validation grants access; persist the result before any mutation. */
export function googleEventCommandIdentity(scope:GoogleWorkspace,eventId:string,operationId:string):string{
 try{return createHash("sha256").update("zelo-google-conference-command-v1\0"+googleWorkspaceKey(scope)+"\0"+uuid(eventId)+"\0"+uuid(operationId)).digest("hex");}
 catch{throw Error("GOOGLE_EVENT_COMMAND_INVALID");}
}
/** Conference creation is a separate explicit command; an ordinary controlled
 * edit cannot provide invitation/provider/owner fields or change conference. */
export function googleEventChangePayload(value:unknown):GoogleEventChangePayload{
 try{const row=object(value);if(!row||"withMeet" in row)throw Error();
  const validated=googleEventCreationPayload({...row,withMeet:false});
  const {withMeet:unused,...payload}=validated;void unused;return Object.freeze(payload);
 }catch{throw Error("GOOGLE_EVENT_COMMAND_INVALID");}
}
export function googleEventChangeBody(payload:GoogleEventChangePayload){
 const time=(value:string)=>payload.allDay?{date:value,...(payload.repeat!=="none"?{timeZone:"America/Sao_Paulo"}:{})}:{dateTime:value,timeZone:"America/Sao_Paulo"};
 return {summary:payload.summary,description:payload.description,location:payload.location,start:time(payload.startAt),end:time(payload.endAt),
  recurrence:payload.repeat==="none"?[]:["RRULE:FREQ="+payload.repeat.toUpperCase()],attendees:payload.attendees.map(entry=>({...entry}))};
}
function timeMatches(payload:GoogleEventChangePayload,expected:string,value:unknown):boolean{
 const row=object(value);if(!row)return false;
 if(payload.repeat!=="none"&&row.timeZone!=="America/Sao_Paulo")return false;
 if(payload.allDay)return row.date===expected&&row.dateTime==null;
 if(row.date!=null||typeof row.dateTime!=="string"||!/T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(row.dateTime))return false;
 try{return new Date(row.dateTime).toISOString()===expected;}catch{return false;}
}
/** A signed command marker alone cannot prove application of the requested
 * payload. Google may enrich display names/responses but not controlled fields. */
export function googleEventChangeMatches(payload:GoogleEventChangePayload,value:unknown):boolean{
 const row=object(value);if(!row||row.summary!==payload.summary||(row.description??"")!==payload.description||(row.location??"")!==payload.location
  ||!timeMatches(payload,payload.startAt,row.start)||!timeMatches(payload,payload.endAt,row.end))return false;
 const recurrence=row.recurrence??[];
 if(!Array.isArray(recurrence)||JSON.stringify(recurrence)!==JSON.stringify(googleEventChangeBody(payload).recurrence))return false;
 const attendees=row.attendees??[];if(!Array.isArray(attendees)||attendees.length!==payload.attendees.length)return false;
 const actual=attendees.map(entry=>object(entry)?.email);if(actual.some(email=>typeof email!=="string"))return false;
 const keys=(actual as string[]).map(email=>email.toLowerCase()).sort();
 return new Set(keys).size===keys.length&&JSON.stringify(keys)===JSON.stringify(payload.attendees.map(entry=>entry.email.toLowerCase()).sort());
}
