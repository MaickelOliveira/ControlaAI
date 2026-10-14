import "server-only";
import {getSupabase} from "./supabase";
import {googleWorkspaceKey,type GoogleWorkspace} from "./google-workspace-policy";
import {googleEventCreationPayload,type GoogleEventCreationPayload} from "./google-event-payload";
export type LocalAppointmentReceipt=Readonly<{eventId:string;workspace:GoogleWorkspace;payload:GoogleEventCreationPayload;source:"web"|"whatsapp"}>;
const SAFE=["GOOGLE_EVENT_INVALID","GOOGLE_EVENT_LOCAL_CONFLICT","GOOGLE_WORKSPACE_ACCESS_DENIED"];
function object(value:unknown,keys:readonly string[]):Record<string,unknown>{if(!value||typeof value!=="object"||Array.isArray(value))throw Error();const row=value as Record<string,unknown>;if(Object.keys(row).some(key=>!keys.includes(key)))throw Error();return row;}
function capture(scope:GoogleWorkspace,eventId:string){
 try{object(scope,["userId","mode","companyId"]);googleWorkspaceKey(scope);if(typeof eventId!=="string"||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(eventId))throw Error();
  return Object.freeze({workspace:Object.freeze({userId:scope.userId.toLowerCase(),mode:scope.mode,companyId:scope.companyId?.toLowerCase()??null}),eventId:eventId.toLowerCase()});
 }catch{throw Error("GOOGLE_EVENT_INPUT_INVALID");}
}
function input(value:unknown):GoogleEventCreationPayload{const payload=googleEventCreationPayload(value);if(payload.withMeet)throw Error();return payload;}
function stored(selected:ReturnType<typeof capture>,value:unknown):LocalAppointmentReceipt{
 try{const row=object(value,["event_id","user_id","mode","company_id","payload","source"]);
  if(row.event_id!==selected.eventId||row.user_id!==selected.workspace.userId||row.mode!==selected.workspace.mode||row.company_id!==selected.workspace.companyId||row.source!=="web"&&row.source!=="whatsapp")throw Error();
  return Object.freeze({...selected,payload:input(row.payload),source:row.source});
 }catch{throw Error("GOOGLE_EVENT_STORAGE_INVALID");}
}
function args(selected:ReturnType<typeof capture>){return {p_user_id:selected.workspace.userId,p_mode:selected.workspace.mode,p_company_id:selected.workspace.companyId,p_event_id:selected.eventId};}
async function rpc(name:string,params:Record<string,unknown>):Promise<unknown>{
 try{const {data,error}=await getSupabase().rpc(name,params);if(error){if(SAFE.includes(error.message))throw Error(error.message);throw Error();}return data;}
 catch(error){throw Error(error instanceof Error&&SAFE.includes(error.message)?error.message:"GOOGLE_EVENT_STORAGE_UNAVAILABLE");}
}
/** Server-only immutable local intention; never provider authorization. */
export async function loadLocalAppointmentReceipt(scope:GoogleWorkspace,eventId:string):Promise<LocalAppointmentReceipt|null>{
 const selected=capture(scope,eventId),value=await rpc("zelo_google_local_appointment_get",args(selected));return value===null?null:stored(selected,value);
}
/** One atomic local insert/receipt. Replays validate original input, not a later
 * edited row, so retries cannot duplicate appointments or overwrite local work. */
export async function prepareLocalAppointmentReceipt(scope:GoogleWorkspace,eventId:string,value:GoogleEventCreationPayload,source:"web"|"whatsapp"):Promise<LocalAppointmentReceipt>{
 const selected=capture(scope,eventId);let payload:GoogleEventCreationPayload;
 try{payload=input(value);if(source!=="web"&&source!=="whatsapp")throw Error();}catch{throw Error("GOOGLE_EVENT_INPUT_INVALID");}
 const receipt=stored(selected,await rpc("zelo_google_local_appointment_create",{...args(selected),p_payload:payload,p_source:source}));
 if(receipt.source!==source||JSON.stringify(receipt.payload)!==JSON.stringify(payload))throw Error("GOOGLE_EVENT_STORAGE_INVALID");return receipt;
}
