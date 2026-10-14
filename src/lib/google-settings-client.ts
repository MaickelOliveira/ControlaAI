import type {GoogleSettings,GoogleSettingsCalendar,WorkspaceView} from "./google-settings-service";

export type GoogleSettingsTarget=Readonly<WorkspaceView&{label:string}>;
export type GoogleClientState=Readonly<{target:GoogleSettingsTarget|null;status:GoogleSettings|null;calendars:readonly GoogleSettingsCalendar[];loading:boolean;busy:boolean;errorCode:string|null;notice:"saved"|"unlinked"|"legacy"|null}>;
type Dependencies={fetch:(url:string,init?:RequestInit)=>Promise<Response>;navigate:(url:string)=>void;changed:(state:GoogleClientState)=>void};
type Token={generation:number;abort:AbortController;target:GoogleSettingsTarget};
const CODES=["GOOGLE_SETTINGS_AUTH_REQUIRED","GOOGLE_SETTINGS_ORIGIN_DENIED","GOOGLE_SETTINGS_ACCESS_DENIED","GOOGLE_SETTINGS_INPUT_INVALID","GOOGLE_SETTINGS_WORKSPACE_CHANGED","GOOGLE_SETTINGS_CONFLICT","GOOGLE_SETTINGS_NOT_CONNECTED","GOOGLE_SETTINGS_STORAGE_UNAVAILABLE","GOOGLE_SETTINGS_STORAGE_INVALID","GOOGLE_SETTINGS_PROVIDER_INVALID","GOOGLE_SETTINGS_PROVIDER_UNAVAILABLE","GOOGLE_SETTINGS_UNAVAILABLE","GOOGLE_SETTINGS_RESPONSE_INVALID"];
export function emptyGoogleClientState():GoogleClientState{return Object.freeze({target:null,status:null,calendars:Object.freeze([]),loading:false,busy:false,errorCode:null,notice:null});}
function object(value:unknown):Record<string,unknown>{if(!value||typeof value!=="object"||Array.isArray(value))throw Error("GOOGLE_SETTINGS_RESPONSE_INVALID");return value as Record<string,unknown>;}
function text(value:unknown,max:number):string{if(typeof value!=="string"||!value.trim()||value.length>max||/\p{Cc}/u.test(value))throw Error("GOOGLE_SETTINGS_RESPONSE_INVALID");return value;}
function version(value:unknown):string{if(typeof value!=="string"||!/^(?:0|[1-9]\d{0,18})$/.test(value)||BigInt(value)>BigInt("9223372036854775807"))throw Error("GOOGLE_SETTINGS_RESPONSE_INVALID");return value;}
function workspace(value:unknown):WorkspaceView{
 const row=object(value);if(row.mode!=="personal"&&row.mode!=="business"||typeof row.workspaceKey!=="string"||!/^[a-f0-9]{64}$/.test(row.workspaceKey))throw Error("GOOGLE_SETTINGS_RESPONSE_INVALID");
 if(row.mode==="personal"?row.companyId!==null:typeof row.companyId!=="string"||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(row.companyId))throw Error("GOOGLE_SETTINGS_RESPONSE_INVALID");
 return Object.freeze({mode:row.mode,companyId:row.companyId as string|null,workspaceKey:row.workspaceKey});
}
function matches(left:WorkspaceView,right:WorkspaceView){return left.workspaceKey===right.workspaceKey&&left.mode===right.mode&&left.companyId===right.companyId;}
function settings(value:unknown,target:GoogleSettingsTarget):GoogleSettings{
 const row=object(value),view=workspace(row.workspace);if(!matches(view,target))throw Error("GOOGLE_SETTINGS_WORKSPACE_CHANGED");
 const bindingVersion=version(row.bindingVersion),legacy=object(row.legacy);
 if(typeof row.activated!=="boolean"||typeof row.connected!=="boolean"||typeof legacy.exists!=="boolean"||typeof legacy.assigned!=="boolean"||typeof legacy.assignedHere!=="boolean"||legacy.assignedHere&&!legacy.assigned)throw Error("GOOGLE_SETTINGS_RESPONSE_INVALID");
 let selectedCalendar:GoogleSettings["selectedCalendar"]=null;
 if(row.connected){const selected=object(row.selectedCalendar);if(!row.activated||bindingVersion==="0"||selected.name!==null&&typeof selected.name!=="string")throw Error("GOOGLE_SETTINGS_RESPONSE_INVALID");selectedCalendar=Object.freeze({id:text(selected.id,1024),name:selected.name===null?null:text(selected.name,512)});}
 else if(row.selectedCalendar!==null)throw Error("GOOGLE_SETTINGS_RESPONSE_INVALID");
 return Object.freeze({workspace:view,activated:row.activated,connected:row.connected,bindingVersion,selectedCalendar,legacy:Object.freeze({exists:legacy.exists,assigned:legacy.assigned,assignedHere:legacy.assignedHere})});
}
function calendars(value:unknown,status:GoogleSettings):readonly GoogleSettingsCalendar[]{
 const row=object(value);if(!matches(workspace(row.workspace),status.workspace)||row.bindingVersion!==status.bindingVersion||row.selectedCalendarId!==status.selectedCalendar?.id||!Array.isArray(row.calendars)||row.calendars.length>5000)throw Error("GOOGLE_SETTINGS_RESPONSE_INVALID");
 const ids=new Set<string>();return Object.freeze(row.calendars.map(value=>{const row=object(value),id=text(row.id,1024);if(ids.has(id)||typeof row.primary!=="boolean")throw Error("GOOGLE_SETTINGS_RESPONSE_INVALID");ids.add(id);return Object.freeze({id,name:text(row.name,512),primary:row.primary});}));
}
export function googleSettingsAuthorizationDestination(value:unknown):string{
 let url:URL;try{url=new URL(text(value,16384));}catch{throw Error("GOOGLE_SETTINGS_RESPONSE_INVALID");}
 if(url.protocol!=="https:"||url.hostname!=="accounts.google.com"||url.port||url.username||url.password||url.pathname!=="/o/oauth2/v2/auth"||url.hash)throw Error("GOOGLE_SETTINGS_RESPONSE_INVALID");return url.href;
}
/** Pure request controller: SSR target is correlation, server auth remains
 * authority. Every async success, failure and finally belongs to one generation. */
export function createGoogleSettingsController(deps:Dependencies){
 let state=emptyGoogleClientState(),generation=0,pending:AbortController|undefined;
 const publish=(patch:Partial<GoogleClientState>)=>{state=Object.freeze({...state,...patch});deps.changed(state);};
 const current=(token:Token)=>token.generation===generation&&!token.abort.signal.aborted&&state.target!==null&&matches(token.target,state.target);
 function clear(notify=true){generation++;pending?.abort();pending=undefined;state=emptyGoogleClientState();if(notify)deps.changed(state);}
 function begin(target:GoogleSettingsTarget,loading=false):Token{
  generation++;pending?.abort();pending=new AbortController();publish({loading,busy:!loading,errorCode:null,notice:null});return {generation,abort:pending,target};
 }
 async function json(token:Token,url:string,body?:Record<string,unknown>){
  const response=await deps.fetch(url,{cache:"no-store",signal:token.abort.signal,...(body?{method:url==="/api/google/calendars"?"PUT":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}:{})});
  let value:unknown;try{value=await response.json();}catch{throw Error("GOOGLE_SETTINGS_RESPONSE_INVALID");}
  if(!response.ok){const code=object(value).code;throw Object.assign(Error(typeof code==="string"&&CODES.includes(code)?code:"GOOGLE_SETTINGS_UNAVAILABLE"),{httpStatus:response.status});}return value;
 }
 function failure(token:Token,error:unknown){
  if(!current(token))return;const message=error instanceof Error?error.message:"",code=CODES.includes(message)?message:"GOOGLE_SETTINGS_UNAVAILABLE";
  if((error as {httpStatus?:unknown})?.httpStatus===401){clear(false);publish({errorCode:"GOOGLE_SETTINGS_AUTH_REQUIRED"});return;}
  publish({errorCode:code,notice:null,...(["GOOGLE_SETTINGS_WORKSPACE_CHANGED","GOOGLE_SETTINGS_ACCESS_DENIED"].includes(code)?{status:null,calendars:Object.freeze([])}:{})});
 }
 async function loadCalendars(token:Token,status:GoogleSettings){
  if(!current(token))return;if(!status.connected){publish({calendars:Object.freeze([])});return;}
  const query=new URLSearchParams({workspaceKey:token.target.workspaceKey,expectedBindingVersion:status.bindingVersion});
  const value=await json(token,`/api/google/calendars?${query}`);if(current(token))publish({calendars:calendars(value,status)});
 }
 async function load(token:Token,retry=true):Promise<void>{
  try{
   const value=await json(token,"/api/google/status");if(!current(token))return;const confirmed=settings(value,token.target);publish({status:confirmed,calendars:Object.freeze([])});await loadCalendars(token,confirmed);
  }catch(error){if(current(token)&&retry&&(error as {httpStatus?:unknown})?.httpStatus===409)return load(token,false);throw error;}
 }
 async function reload(){
  if(!state.target||state.busy||state.loading)return;const token=begin(state.target,true);
  try{await load(token);}catch(error){failure(token,error);}finally{if(current(token))publish({loading:false,busy:false});}
 }
 async function setTarget(target:GoogleSettingsTarget|null){
  clear();if(!target)return;
  try{const view=workspace(target);publish({target:Object.freeze({...view,label:text(target.label,100)})});await reload();}catch(error){publish({errorCode:error instanceof Error&&CODES.includes(error.message)?error.message:"GOOGLE_SETTINGS_RESPONSE_INVALID"});}
 }
 async function action(kind:"connect"|"select"|"unlink"|"legacy",value?:string){
  if(!state.target||!state.status||state.busy||state.loading)return;
  if(kind==="select"&&(!state.status.connected||!state.calendars.some(item=>item.id===value)))return;
  if(kind==="unlink"&&!state.status.connected)return;
  if(kind==="legacy"&&(value!==state.target.workspaceKey||state.status.connected||!state.status.legacy.exists||state.status.legacy.assigned))return;
  if(kind==="connect"&&!["pt-BR","pt-PT","es"].includes(value??""))return;
  const confirmed=state.status,token=begin(state.target),expected={workspaceKey:token.target.workspaceKey,expectedBindingVersion:confirmed.bindingVersion};
  const url=kind==="connect"?"/api/google/connect":kind==="select"?"/api/google/calendars":kind==="legacy"?"/api/google/legacy":"/api/google/disconnect";
  try{
   const result=await json(token,url,{...expected,...(kind==="connect"?{locale:value}:kind==="select"?{calendarId:value}:kind==="legacy"?{confirmTarget:true}:{})});if(!current(token))return;
   if(kind==="connect"){deps.navigate(googleSettingsAuthorizationDestination(object(result).authorizationUrl));return;}
   const updated=settings(result,token.target);
   if(BigInt(updated.bindingVersion)!==BigInt(confirmed.bindingVersion)+BigInt(1)
    ||kind==="unlink"&&updated.connected
    ||kind==="select"&&(!updated.connected||updated.selectedCalendar?.id!==value)
    ||kind==="legacy"&&(!updated.connected||!updated.legacy.assignedHere))throw Error("GOOGLE_SETTINGS_RESPONSE_INVALID");
   publish({status:updated,errorCode:null,notice:kind==="select"?"saved":kind==="unlink"?"unlinked":"legacy",...(kind==="unlink"?{calendars:Object.freeze([])}:{})});
   if(kind==="legacy")await loadCalendars(token,updated);
  }catch(error){
   if(current(token)&&(error as {httpStatus?:unknown})?.httpStatus===409){try{await load(token);}catch(reloadError){failure(token,reloadError);}if(current(token)&&state.status)failure(token,error);}
   else failure(token,error);
  }finally{if(current(token))publish({busy:false,loading:false});}
 }
 return Object.freeze({state:()=>state,setTarget,reload,clear,chooseCalendar:(id:string)=>action("select",id),connect:(locale:"pt-BR"|"pt-PT"|"es")=>action("connect",locale),unlink:()=>action("unlink"),assignLegacy:(confirmedWorkspaceKey:string)=>action("legacy",confirmedWorkspaceKey)});
}
