import "server-only";
import {createHash} from "node:crypto";
import {google} from "googleapis";
import {getSupabase} from "./supabase";
import {googleWorkspaceKey,type GoogleWorkspace} from "./google-workspace-policy";
import {googleOAuthBindingVersion} from "./google-oauth-state";
import {loadGoogleBinding,googleBindingFromStorage,type GoogleBinding} from "./google-binding-store";
import {loadGoogleLegacyStatus,type GoogleLegacyStatus} from "./google-legacy-assignment";
import {loadGoogleOwnerActivation} from "./google-owner-activation";
import {withGoogleWorkspaceClient} from "./google-workspace-runtime";

export type WorkspaceView=Readonly<{mode:GoogleWorkspace["mode"];companyId:string|null;workspaceKey:string}>;
export type ExpectedSettings=Readonly<{workspaceKey:string;expectedBindingVersion:string}>;
export type GoogleSettings=Readonly<{workspace:WorkspaceView;activated:boolean;connected:boolean;bindingVersion:string;selectedCalendar:Readonly<{id:string;name:string|null}>|null;legacy:GoogleLegacyStatus}>;
export type GoogleSettingsCalendar=Readonly<{id:string;name:string;primary:boolean}>;
export type GoogleSettingsCalendars=Readonly<{workspace:WorkspaceView;bindingVersion:string;selectedCalendarId:string;calendars:readonly GoogleSettingsCalendar[]}>;
const CODES=["GOOGLE_SETTINGS_INPUT_INVALID","GOOGLE_SETTINGS_WORKSPACE_CHANGED","GOOGLE_SETTINGS_CONFLICT","GOOGLE_SETTINGS_NOT_CONNECTED","GOOGLE_SETTINGS_STORAGE_UNAVAILABLE","GOOGLE_SETTINGS_STORAGE_INVALID","GOOGLE_SETTINGS_PROVIDER_INVALID","GOOGLE_SETTINGS_PROVIDER_UNAVAILABLE"];
function safe(error:unknown):Error{
 const code=error instanceof Error?error.message:"";
 if(CODES.includes(code))return Error(code);
 if(code==="GOOGLE_BINDING_CONFLICT"||code==="GOOGLE_RUNTIME_CHANGED")return Error("GOOGLE_SETTINGS_CONFLICT");
 if(code==="GOOGLE_RUNTIME_NOT_CONNECTED")return Error("GOOGLE_SETTINGS_NOT_CONNECTED");
 if(["GOOGLE_BINDING_STORAGE_INVALID","GOOGLE_LEGACY_STORAGE_INVALID","GOOGLE_ACTIVATION_STORAGE_INVALID","GOOGLE_RUNTIME_STORAGE_INVALID"].includes(code))return Error("GOOGLE_SETTINGS_STORAGE_INVALID");
 if(["GOOGLE_BINDING_STORAGE_UNAVAILABLE","GOOGLE_LEGACY_STORAGE_UNAVAILABLE","GOOGLE_ACTIVATION_STORAGE_UNAVAILABLE","GOOGLE_RUNTIME_STORAGE_UNAVAILABLE"].includes(code))return Error("GOOGLE_SETTINGS_STORAGE_UNAVAILABLE");
 return Error("GOOGLE_SETTINGS_PROVIDER_UNAVAILABLE");
}
function record(value:unknown,keys?:readonly string[]):Record<string,unknown>{
 if(!value||typeof value!=="object"||Array.isArray(value))throw Error();const row=value as Record<string,unknown>;
 if(keys&&Object.keys(row).some(key=>!keys.includes(key)))throw Error();return row;
}
function capture(scope:GoogleWorkspace):GoogleWorkspace{
 try{record(scope,["userId","mode","companyId"]);googleWorkspaceKey(scope);return Object.freeze({userId:scope.userId.toLowerCase(),mode:scope.mode,companyId:scope.companyId?.toLowerCase()??null});}
 catch{throw Error("GOOGLE_SETTINGS_INPUT_INVALID");}
}
/** The digest prevents stale UI targeting; it is not credential authority. */
export function googleSettingsWorkspaceView(scope:GoogleWorkspace):WorkspaceView{
 const selected=capture(scope),workspaceKey=createHash("sha256").update(`google-settings-workspace\0${googleWorkspaceKey(selected)}`).digest("hex");
 return Object.freeze({mode:selected.mode,companyId:selected.companyId,workspaceKey});
}
function expected(scope:GoogleWorkspace,value:unknown,selection=false):ExpectedSettings{
 let parsed:ExpectedSettings;
 try{
  const row=record(value,selection?["workspaceKey","expectedBindingVersion","calendarId"]:["workspaceKey","expectedBindingVersion"]);
  if(typeof row.workspaceKey!=="string"||!/^[a-f0-9]{64}$/.test(row.workspaceKey))throw Error();
  parsed=Object.freeze({workspaceKey:row.workspaceKey,expectedBindingVersion:googleOAuthBindingVersion(row.expectedBindingVersion)});
 }catch{throw Error("GOOGLE_SETTINGS_INPUT_INVALID");}
 if(parsed.workspaceKey!==googleSettingsWorkspaceView(scope).workspaceKey)throw Error("GOOGLE_SETTINGS_WORKSPACE_CHANGED");return parsed;
}
function same(left:GoogleBinding|null,right:GoogleBinding|null):boolean{
 return left===null?right===null:right!==null&&left.id===right.id&&left.grantId===right.grantId&&left.version===right.version&&left.unlinkedAt===right.unlinkedAt&&googleWorkspaceKey(left.workspace)===googleWorkspaceKey(right.workspace);
}
async function checked(scope:GoogleWorkspace,input:ExpectedSettings):Promise<GoogleBinding|null>{
 const binding=await loadGoogleBinding(scope);
 if((binding?.version??"0")!==input.expectedBindingVersion)throw Error("GOOGLE_SETTINGS_CONFLICT");return binding;
}
/** Private guard for connect/legacy boundaries. Never serialize the returned
 * binding; this helper validates an expectation, not an arbitrary workspace. */
export async function assertGoogleSettingsExpected(scope:GoogleWorkspace,value:unknown):Promise<GoogleBinding|null>{
 try{const selected=capture(scope),input=expected(selected,value);return await checked(selected,input);}catch(error){throw safe(error);}
}
export async function loadGoogleSettings(scope:GoogleWorkspace):Promise<GoogleSettings>{
 try{
  const selected=capture(scope),[binding,legacy]=await Promise.all([loadGoogleBinding(selected),loadGoogleLegacyStatus(selected)]);
  const activated=await loadGoogleOwnerActivation(selected.userId);
  if(!same(binding,await loadGoogleBinding(selected)))throw Error("GOOGLE_SETTINGS_CONFLICT");
  if(!activated&&(binding!==null||legacy.assigned))throw Error("GOOGLE_SETTINGS_STORAGE_INVALID");
  const connected=binding!==null&&binding.unlinkedAt===null;
  return Object.freeze({workspace:googleSettingsWorkspaceView(selected),activated,connected,bindingVersion:binding?.version??"0",selectedCalendar:connected?Object.freeze({id:binding.calendarId,name:binding.calendarName}):null,legacy:Object.freeze({exists:legacy.exists,assigned:legacy.assigned,assignedHere:legacy.assignedHere})});
 }catch(error){throw safe(error);}
}
async function active(scope:GoogleWorkspace,input:ExpectedSettings):Promise<GoogleBinding>{
 const binding=await checked(scope,input);if(!binding||binding.unlinkedAt!==null)throw Error("GOOGLE_SETTINGS_NOT_CONNECTED");
 if(!await loadGoogleOwnerActivation(scope.userId))throw Error("GOOGLE_SETTINGS_STORAGE_INVALID");return binding;
}
async function preflight(scope:GoogleWorkspace,binding:GoogleBinding):Promise<void>{
 if(!same(binding,await loadGoogleBinding(scope)))throw Error("GOOGLE_SETTINGS_CONFLICT");
}
async function provider<T>(scope:GoogleWorkspace,binding:GoogleBinding,operation:(calendar:ReturnType<typeof google.calendar>)=>Promise<T>):Promise<T>{
 let callbackError:Error|undefined;
 try{
  return await withGoogleWorkspaceClient(scope,{bindingId:binding.id,grantId:binding.grantId},async(auth,current)=>{
   try{if(!same(binding,current))throw Error("GOOGLE_SETTINGS_CONFLICT");await preflight(scope,binding);return await operation(google.calendar({version:"v3",auth}));}
   catch(error){callbackError=safe(error);throw callbackError;}
  });
 }catch(error){throw callbackError??safe(error);}
}
function text(value:unknown,max:number):string{
 if(typeof value!=="string"||!value.trim()||value.length>max||/\p{Cc}/u.test(value))throw Error();return value;
}
function option(value:unknown):GoogleSettingsCalendar|null{
 try{
  const row=record(value),id=text(row.id,1024);
  if(row.primary!==undefined&&typeof row.primary!=="boolean"||row.deleted!==undefined&&typeof row.deleted!=="boolean")throw Error();
  if(!["owner","writer","reader","freeBusyReader"].includes(row.accessRole as string))throw Error();
  if(row.summaryOverride!==undefined&&typeof row.summaryOverride!=="string"||row.summary!==undefined&&typeof row.summary!=="string")throw Error();
  for(const label of [row.summaryOverride,row.summary])if(typeof label==="string"&&(label.length>512||/\p{Cc}/u.test(label)))throw Error();
  if(row.deleted===true||row.accessRole!=="owner"&&row.accessRole!=="writer")return null;
  return Object.freeze({id,name:text(row.summaryOverride||row.summary||id,512),primary:row.primary===true});
 }catch{throw Error("GOOGLE_SETTINGS_PROVIDER_INVALID");}
}
export async function listGoogleSettingsCalendars(scope:GoogleWorkspace,value:unknown):Promise<GoogleSettingsCalendars>{
 try{
  const selected=capture(scope),input=expected(selected,value),binding=await active(selected,input);
  return await provider(selected,binding,async calendar=>{
   const calendars:GoogleSettingsCalendar[]=[],ids=new Set<string>(),tokens=new Set<string>();let pageToken:string|undefined;
   for(let page=0;page<20;page++){
    await preflight(selected,binding);
    const {data}=await calendar.calendarList.list({minAccessRole:"writer",showHidden:false,maxResults:250,pageToken},{retry:false,timeout:15000});
    let entries:unknown[],next:string|undefined;
    try{
     const row=record(data);if(row.items!==undefined&&!Array.isArray(row.items))throw Error();entries=row.items as unknown[]??[];
     if(entries.length>250)throw Error();
     if(row.nextPageToken!==undefined&&row.nextPageToken!==null&&row.nextPageToken!=="")next=text(row.nextPageToken,2048);
     if(next&&tokens.has(next))throw Error();if(next)tokens.add(next);
    }catch{throw Error("GOOGLE_SETTINGS_PROVIDER_INVALID");}
    for(const entry of entries){const parsed=option(entry);if(parsed){if(ids.has(parsed.id))throw Error("GOOGLE_SETTINGS_PROVIDER_INVALID");ids.add(parsed.id);calendars.push(parsed);}}
    if(calendars.filter(item=>item.primary).length>1)throw Error("GOOGLE_SETTINGS_PROVIDER_INVALID");
    if(!next){await preflight(selected,binding);return Object.freeze({workspace:googleSettingsWorkspaceView(selected),bindingVersion:binding.version,selectedCalendarId:binding.calendarId,calendars:Object.freeze(calendars.sort((a,b)=>Number(b.primary)-Number(a.primary)||a.name.localeCompare(b.name)))});}
    pageToken=next;
   }
   throw Error("GOOGLE_SETTINGS_PROVIDER_UNAVAILABLE");
  });
 }catch(error){throw safe(error);}
}
async function mutate(scope:GoogleWorkspace,binding:GoogleBinding,calendar:GoogleSettingsCalendar|null):Promise<GoogleSettings>{
 let data:unknown;
 try{
  const {data:result,error}=await getSupabase().rpc(calendar?"zelo_google_binding_select_calendar":"zelo_google_binding_unlink",{p_user_id:scope.userId,p_mode:scope.mode,p_company_id:scope.companyId,p_binding_version:binding.version,...(calendar?{p_calendar_id:calendar.id,p_calendar_name:calendar.name}:{})});
  if(error){if(error.message==="GOOGLE_BINDING_CONFLICT")throw Error("GOOGLE_SETTINGS_CONFLICT");throw Error();}data=result;
 }catch(error){if(error instanceof Error&&error.message==="GOOGLE_SETTINGS_CONFLICT")throw error;throw Error("GOOGLE_SETTINGS_STORAGE_UNAVAILABLE");}
 let saved:GoogleBinding;
 try{
  saved=googleBindingFromStorage(data,scope);
  if(saved.id!==binding.id||saved.grantId!==binding.grantId||BigInt(saved.version)!==BigInt(binding.version)+BigInt(1))throw Error();
  if(calendar?saved.unlinkedAt!==null||saved.calendarId!==calendar.id||saved.calendarName!==calendar.name:saved.unlinkedAt===null||saved.calendarId!==binding.calendarId||saved.calendarName!==binding.calendarName)throw Error();
 }catch{throw Error("GOOGLE_SETTINGS_STORAGE_INVALID");}
 const status=await loadGoogleSettings(scope);
 if(status.bindingVersion!==saved.version||status.connected!==(calendar!==null))throw Error("GOOGLE_SETTINGS_CONFLICT");
 if(calendar&&(status.selectedCalendar?.id!==saved.calendarId||status.selectedCalendar.name!==saved.calendarName))throw Error("GOOGLE_SETTINGS_STORAGE_INVALID");return status;
}
export async function selectGoogleSettingsCalendar(scope:GoogleWorkspace,value:unknown):Promise<GoogleSettings>{
 try{
  const selected=capture(scope),input=expected(selected,value,true);let calendarId:string;
  try{calendarId=text(record(value).calendarId,1024);}catch{throw Error("GOOGLE_SETTINGS_INPUT_INVALID");}
  const binding=await active(selected,input);
  const chosen=await provider(selected,binding,async calendar=>{
   await preflight(selected,binding);const {data}=await calendar.calendarList.get({calendarId},{retry:false,timeout:15000});
   const parsed=option(data);if(!parsed||(calendarId==="primary"?!parsed.primary:parsed.id!==calendarId))throw Error("GOOGLE_SETTINGS_PROVIDER_INVALID");
   await preflight(selected,binding);return parsed;
  });
  return await mutate(selected,binding,chosen);
 }catch(error){throw safe(error);}
}
export async function unlinkGoogleSettings(scope:GoogleWorkspace,value:unknown):Promise<GoogleSettings>{
 try{const selected=capture(scope),input=expected(selected,value),binding=await active(selected,input);return await mutate(selected,binding,null);}catch(error){throw safe(error);}
}
