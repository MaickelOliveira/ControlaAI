import "server-only";
import {randomUUID} from "node:crypto";
import {currentCompanyContext} from "./company-context";
import {googleWorkspaceFromContext,googleWorkspaceKey,type GoogleWorkspace} from "./google-workspace-policy";
import {googleAgendaSyncVersion} from "./google-agenda-client-contract";

export type GoogleWhatsAppOperation="create_appointment"|"create_meet"|"update_appointment"|"cancel_appointment"|"add_meet"|"retry";
export type GoogleWhatsAppIntent=Readonly<{clientMutationId:string;workspace:GoogleWorkspace;operation:GoogleWhatsAppOperation;appointmentId:string|null;expectedGoogleSyncVersion:string|null;payload:Readonly<Record<string,unknown>>}>;
type IntentOptions=Readonly<{clientMutationId?:string;appointmentId?:string;expectedGoogleSyncVersion?:string|null}>;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const fields:Record<GoogleWhatsAppOperation,readonly string[]>={
 create_appointment:["title","description","location","startAt","endAt","allDay","repeat","withMeet","attendees"],
 create_meet:["title","description","startAt","endAt","attendees"],
 update_appointment:["title","description","location","startAt","endAt","allDay","repeat","status"],
 cancel_appointment:[],add_meet:[],retry:[],
};
function record(value:unknown,keys?:readonly string[]):Record<string,unknown>{
 if(!value||typeof value!=="object"||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw Error();
 const row=value as Record<string,unknown>;if(keys&&Object.keys(row).some(key=>!keys.includes(key)))throw Error();return row;
}
function uuid(value:unknown):string{if(typeof value!=="string"||!UUID.test(value))throw Error();return value.toLowerCase();}
function creation(operation:GoogleWhatsAppOperation):boolean{return operation==="create_appointment"||operation==="create_meet";}
function payload(operation:GoogleWhatsAppOperation,value:unknown):Readonly<Record<string,unknown>>{
 const row=record(value,fields[operation]);let nodes=0;
 function copy(value:unknown,depth=0):unknown{
  if(++nodes>2048||depth>12)throw Error();
  if(value===null||typeof value==="boolean")return value;
  if(typeof value==="string"){if(value.length>32768)throw Error();return value;}
  if(typeof value==="number"&&Number.isFinite(value))return value;
  if(Array.isArray(value)){if(value.length>1000)throw Error();return Object.freeze(value.map(item=>copy(item,depth+1)));}
  const input=record(value),keys=Object.keys(input).filter(key=>input[key]!==undefined).sort();if(keys.length>100)throw Error();
  return Object.freeze(Object.fromEntries(keys.map(key=>[key,copy(input[key],depth+1)])));
 }
 const result=copy(row) as Readonly<Record<string,unknown>>;
 if(Buffer.byteLength(JSON.stringify(result),"utf8")>32768)throw Error();
 if(creation(operation)&&(!Object.hasOwn(result,"title")||!Object.hasOwn(result,"startAt")||operation==="create_meet"&&!Object.hasOwn(result,"endAt")))throw Error();
 if(operation==="update_appointment"&&!Object.keys(result).length)throw Error();return result;
}
function parsed(value:unknown):GoogleWhatsAppIntent{
 const row=record(value,["clientMutationId","workspace","operation","appointmentId","expectedGoogleSyncVersion","payload"]);
 if(typeof row.operation!=="string"||!Object.hasOwn(fields,row.operation))throw Error();const operation=row.operation as GoogleWhatsAppOperation;
 const stored=record(row.workspace,["userId","mode","companyId"]);
 const workspace=Object.freeze({userId:uuid(stored.userId),mode:stored.mode as GoogleWorkspace["mode"],companyId:stored.companyId===null?null:uuid(stored.companyId)});googleWorkspaceKey(workspace);
 const expectedGoogleSyncVersion=googleAgendaSyncVersion(row.expectedGoogleSyncVersion),isCreation=creation(operation);
 if(isCreation&&(row.appointmentId!==null||expectedGoogleSyncVersion!==null))throw Error();
 return Object.freeze({clientMutationId:uuid(row.clientMutationId),workspace,operation,appointmentId:isCreation?null:uuid(row.appointmentId),expectedGoogleSyncVersion,payload:payload(operation,row.payload)});
}
/** Only withWhatsAppCompany's verified participant context is authority. */
export function captureGoogleWhatsAppWorkspace(userId:string):GoogleWorkspace{
 try{return googleWorkspaceFromContext(userId,currentCompanyContext());}catch{throw Error("GOOGLE_WHATSAPP_SCOPE_DENIED");}
}
/** Persist before an effect. A completed form/action owns one UUID and payload;
 * neither model output nor a replay can select a different workspace. */
export function prepareGoogleWhatsAppIntent(userId:string,operation:GoogleWhatsAppOperation,input:unknown,options:IntentOptions={}):GoogleWhatsAppIntent{
 const workspace=captureGoogleWhatsAppWorkspace(userId);
 try{
  const selected=record(options,["clientMutationId","appointmentId","expectedGoogleSyncVersion"]);
  if(!Object.hasOwn(fields,operation)||!creation(operation)&&!Object.hasOwn(selected,"expectedGoogleSyncVersion"))throw Error();
  return parsed({clientMutationId:selected.clientMutationId===undefined?randomUUID():selected.clientMutationId,workspace,operation,appointmentId:creation(operation)?selected.appointmentId??null:selected.appointmentId,expectedGoogleSyncVersion:creation(operation)?selected.expectedGoogleSyncVersion??null:selected.expectedGoogleSyncVersion,payload:input});
 }catch{throw Error("GOOGLE_WHATSAPP_INPUT_INVALID");}
}
/** Stored provenance is a stale guard only. Current confirmed scope is checked
 * again before execution; failed attempts retain their original exact payload. */
export function replayGoogleWhatsAppIntent(userId:string,value:unknown,expectedPayload?:unknown):GoogleWhatsAppIntent{
 const current=captureGoogleWhatsAppWorkspace(userId);let intent:GoogleWhatsAppIntent;
 try{intent=parsed(value);}catch{throw Error("GOOGLE_WHATSAPP_INPUT_INVALID");}
 if(googleWorkspaceKey(current)!==googleWorkspaceKey(intent.workspace))throw Error("GOOGLE_WHATSAPP_WORKSPACE_CHANGED");
 if(expectedPayload!==undefined){
  let expected:Readonly<Record<string,unknown>>;try{expected=payload(intent.operation,expectedPayload);}catch{throw Error("GOOGLE_WHATSAPP_INPUT_INVALID");}
  if(JSON.stringify(expected)!==JSON.stringify(intent.payload))throw Error("GOOGLE_WHATSAPP_INTENT_CHANGED");
 }
 return intent;
}
