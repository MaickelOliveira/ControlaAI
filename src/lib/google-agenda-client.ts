import {googleAgendaAppointment,googleAgendaAppointments,type GoogleAgendaAppointment} from "./google-agenda-client-contract";
import type {GoogleSettingsTarget} from "./google-settings-client";
export type GoogleAgendaClientState=Readonly<{target:GoogleSettingsTarget|null;appointments:readonly GoogleAgendaAppointment[];loading:boolean;busy:boolean;googleConnected:boolean;errorCode:string|null}>;
type Dependencies={fetch:(url:string,init?:RequestInit)=>Promise<Response>;uuid:()=>string;changed:(state:GoogleAgendaClientState)=>void};
export function emptyGoogleAgendaState():GoogleAgendaClientState{return Object.freeze({target:null,appointments:Object.freeze([]),loading:false,busy:false,googleConnected:false,errorCode:null});}
function payload(value:Record<string,unknown>):string{return JSON.stringify(Object.fromEntries(Object.entries(value).filter(([,value])=>value!==undefined).sort(([a],[b])=>a.localeCompare(b))));}
/** Identities stay in memory for this explicit form/action intent; they confer
 * no record ownership. Ambiguous responses never replace UUID or payload. */
export function createGoogleAgendaController(deps:Dependencies){
 let state=emptyGoogleAgendaState(),generation=0,pending:AbortController|undefined;const intents=new Map<string,{id:string;url:string;method:string;body:string}>();
 const publish=(patch:Partial<GoogleAgendaClientState>)=>{state=Object.freeze({...state,...patch});deps.changed(state);};
 const clear=(notify=true)=>{generation++;pending?.abort();pending=undefined;intents.clear();state=emptyGoogleAgendaState();if(notify)deps.changed(state);};
 const valid=(token:number)=>generation===token&&!pending?.signal.aborted&&state.target!==null;
 async function read(url:string,init:RequestInit={}):Promise<{value:unknown;status:number}>{
  const workspaceKey=state.target?.workspaceKey;if(!workspaceKey)throw Error("AGENDA_WORKSPACE_CHANGED");
  const headers=new Headers(init.headers);headers.set("X-Zelo-Workspace-Key",workspaceKey);
  const response=await deps.fetch(url,{...init,headers,cache:"no-store",signal:pending?.signal});
  if(response.ok&&response.headers.get("X-Zelo-Workspace-Key")!==workspaceKey)throw Error("AGENDA_WORKSPACE_CHANGED");
  let value:unknown;try{value=await response.json();}catch{throw Error("AGENDA_RESPONSE_INVALID");}
  if(!response.ok){
   const scopeChanged=value&&typeof value==="object"&&["GOOGLE_SETTINGS_WORKSPACE_CHANGED","GOOGLE_EVENT_WORKSPACE_CHANGED"].includes((value as {code?:string}).code??"");
   throw Object.assign(Error(response.status===401?"AGENDA_AUTH_REQUIRED":scopeChanged?"AGENDA_WORKSPACE_CHANGED":response.status===409?"AGENDA_CONFLICT":response.status===403?"AGENDA_ACCESS_DENIED":"AGENDA_UNAVAILABLE"),{status:response.status});
  }return {value,status:response.status};
 }
 function failed(token:number,error:unknown){if(!valid(token))return;const code=error instanceof Error&&["AGENDA_RESPONSE_INVALID","AGENDA_CONFLICT","AGENDA_INTENT_CHANGED","AGENDA_AUTH_REQUIRED","AGENDA_WORKSPACE_CHANGED","AGENDA_ACCESS_DENIED"].includes(error.message)?error.message:"AGENDA_UNAVAILABLE";if(code==="AGENDA_AUTH_REQUIRED"){clear(false);publish({errorCode:code});}else publish({errorCode:code,...(["AGENDA_WORKSPACE_CHANGED","AGENDA_ACCESS_DENIED"].includes(code)?{appointments:Object.freeze([]),googleConnected:false}:{})});}
 async function refresh(token:number){const {value}=await read("/api/agenda");if(valid(token))publish({appointments:googleAgendaAppointments(value)});}
 async function reload(){
  if(!state.target||state.busy||state.loading)return;const token=++generation;pending?.abort();pending=new AbortController();publish({loading:true,errorCode:null});
  try{
   await refresh(token);if(!valid(token))return;const {value}=await read("/api/google/status");if(!valid(token))return;
   const response=value as {workspace?:GoogleSettingsTarget;connected?:unknown};const target=response?.workspace;
   if(!target||target.workspaceKey!==state.target!.workspaceKey||target.mode!==state.target!.mode||target.companyId!==state.target!.companyId)throw Error("AGENDA_CONFLICT");
   publish({googleConnected:response.connected===true});
  }catch(error){failed(token,error);}finally{if(valid(token))publish({loading:false});}
 }
 async function setTarget(target:GoogleSettingsTarget|null){clear();if(target){publish({target:Object.freeze({...target})});await reload();}}
 function newIntent(){const id=deps.uuid();if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id))throw Error("AGENDA_INTENT_CHANGED");return id.toLowerCase();}
 function upsert(record:GoogleAgendaAppointment){const rows=state.appointments.filter(value=>value.id!==record.id);if(record.status!=="cancelled"||record.googleCancellationPending)rows.push(record);publish({appointments:Object.freeze(rows.sort((a,b)=>a.startAt.localeCompare(b.startAt)))});}
 async function execute(intentKey:string,url:string,method:string,body:Record<string,unknown>,creation=false,metadata=false):Promise<GoogleAgendaAppointment|null>{
  if(!state.target||state.busy||state.loading||["AGENDA_WORKSPACE_CHANGED","AGENDA_ACCESS_DENIED"].includes(state.errorCode??""))return null;const serialized=payload(body),existing=intents.get(intentKey);
  if(existing&&(existing.url!==url||existing.method!==method||existing.body!==serialized)){publish({errorCode:"AGENDA_INTENT_CHANGED"});return null;}
  let intent=existing;
  if(!intent){intent={id:creation?intentKey:newIntent(),url,method,body:serialized};intents.set(intentKey,intent);}
  const wire=metadata?JSON.parse(intent.body):{...JSON.parse(intent.body),clientMutationId:intent.id};
  const token=++generation;pending?.abort();pending=new AbortController();publish({busy:true,errorCode:null});
  try{
   const result=await read(url,{method,headers:{"Content-Type":"application/json"},body:JSON.stringify(wire)});if(!valid(token))return null;
   if(creation&&result.status!==201)throw Error("AGENDA_RESPONSE_INVALID");
   if(method==="DELETE"&&result.value&&typeof result.value==="object"&&(result.value as {ok?:unknown}).ok===true){await refresh(token);if(valid(token))intents.delete(intentKey);return null;}
   const confirmed=googleAgendaAppointment(result.value);upsert(confirmed);intents.delete(intentKey);return confirmed;
  }catch(error){if(valid(token)&&(error as {status?:unknown})?.status===409){try{await refresh(token);}catch(refreshError){failed(token,refreshError);}}failed(token,error);return null;}
  finally{if(valid(token))publish({busy:false});}
 }
 return Object.freeze({state:()=>state,newIntent,setTarget,reload,clear,clearError:()=>{if(!["AGENDA_WORKSPACE_CHANGED","AGENDA_ACCESS_DENIED"].includes(state.errorCode??""))publish({errorCode:null});},
  create:(id:string,body:Record<string,unknown>)=>execute(id,"/api/agenda","POST",body,true),
  patch:(id:string,record:GoogleAgendaAppointment,body:Record<string,unknown>)=>{const clean={...body};delete clean.withMeet;return execute(id,`/api/agenda/${record.id}`,"PATCH",{...clean,googleSyncVersion:record.googleSyncVersion});},
  done:(record:GoogleAgendaAppointment)=>execute(`done:${record.id}`,`/api/agenda/${record.id}`,"PATCH",{status:"done"},false,true),
  remove:(record:GoogleAgendaAppointment)=>execute(`delete:${record.id}`,`/api/agenda/${record.id}`,"DELETE",{googleSyncVersion:record.googleSyncVersion}),
  retry:(record:GoogleAgendaAppointment)=>execute(`retry:${record.id}`,`/api/agenda/${record.id}/google-retry`,"POST",{googleSyncVersion:record.googleSyncVersion}),
 });
}
