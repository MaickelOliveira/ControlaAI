import "server-only";
import {NextResponse} from "next/server";
import {getSession} from "./auth";
import {companyScopeFor,runWithCompanyRequest} from "./company-context";
import {googleWorkspaceFromContext,type GoogleWorkspace} from "./google-workspace-policy";
import {googleSettingsWorkspaceView} from "./google-settings-service";
import {isSameOrigin} from "./request-origin";
import {readBankBody} from "./open-finance-body";

const headers={"Cache-Control":"private, no-store"};
const errors:Record<string,readonly [number,string]>={
 GOOGLE_EVENT_AUTH_REQUIRED:[401,"Entre na sua conta para continuar."],
 GOOGLE_EVENT_ORIGIN_DENIED:[403,"Origem não autorizada."],
 GOOGLE_EVENT_ACCESS_DENIED:[403,"Este espaço não está disponível para esta conta."],
 GOOGLE_EVENT_INPUT_INVALID:[400,"Confira os dados e tente novamente."],
 GOOGLE_SETTINGS_WORKSPACE_CHANGED:[409,"O espaço mudou. Atualize a página e tente novamente."],
 GOOGLE_EVENT_CONFLICT:[409,"O compromisso ou a conexão mudou. Atualize a página e tente novamente."],
 GOOGLE_EVENT_NOT_FOUND:[404,"Este compromisso não está disponível."],
 GOOGLE_EVENT_NOT_CONNECTED:[400,"Conecte o Google neste espaço para continuar."],
 GOOGLE_EVENT_UNAVAILABLE:[503,"Não foi possível concluir a ação. Tente novamente."],
};
const aliases:Record<string,string>={
 GOOGLE_EVENT_COMMAND_CONFLICT:"GOOGLE_EVENT_CONFLICT",GOOGLE_EVENT_CONNECTION_CHANGED:"GOOGLE_EVENT_CONFLICT",GOOGLE_EVENT_ORIGIN_CONFLICT:"GOOGLE_EVENT_CONFLICT",GOOGLE_EVENT_LOCAL_CONFLICT:"GOOGLE_EVENT_CONFLICT",GOOGLE_EVENT_LOCAL_INACTIVE:"GOOGLE_EVENT_CONFLICT",GOOGLE_EVENT_ATTEMPT_CONFLICT:"GOOGLE_EVENT_CONFLICT",GOOGLE_RUNTIME_CHANGED:"GOOGLE_EVENT_CONFLICT",
 GOOGLE_EVENT_ORIGIN_MISSING:"GOOGLE_EVENT_NOT_FOUND",
 GOOGLE_EVENT_COMMAND_INVALID:"GOOGLE_EVENT_INPUT_INVALID",GOOGLE_EVENT_INVALID:"GOOGLE_EVENT_INPUT_INVALID",GOOGLE_EVENT_PAYLOAD_INVALID:"GOOGLE_EVENT_INPUT_INVALID",GOOGLE_EVENT_IDENTITY_INVALID:"GOOGLE_EVENT_INPUT_INVALID",
 GOOGLE_RUNTIME_NOT_CONNECTED:"GOOGLE_EVENT_NOT_CONNECTED",
};
const denied=["COMPANY_CONTEXT_MISSING","COMPANY_OWNER_MISMATCH","COMPANY_ACCESS_DENIED","COMPANY_NOT_FOUND","COMPANY_REQUIRED","COMPANY_INVALID","GOOGLE_WORKSPACE_REQUIRED","GOOGLE_WORKSPACE_INVALID","GOOGLE_WORKSPACE_OWNER_MISMATCH","GOOGLE_WORKSPACE_ACCESS_DENIED","GOOGLE_WORKSPACE_MISMATCH"];
function failure(error:unknown):NextResponse{
 const message=error instanceof Error?error.message:"";
 const code=Object.hasOwn(errors,message)?message:Object.hasOwn(aliases,message)?aliases[message]:denied.includes(message)?"GOOGLE_EVENT_ACCESS_DENIED":"GOOGLE_EVENT_UNAVAILABLE";
 const [status,text]=errors[code];return NextResponse.json({error:text,code},{status,headers});
}
/** Correlation only: the digest never selects or authorizes a workspace. */
export function assertGoogleWorkspaceHeader(request:Request,scope:GoogleWorkspace,required=false):string{
 const key=googleSettingsWorkspaceView(scope).workspaceKey,value=request.headers.get("X-Zelo-Workspace-Key");
 if((required||value!==null)&&value!==key)throw Error("GOOGLE_SETTINGS_WORKSPACE_CHANGED");return key;
}
/** Actions must return public DTOs. Scope authority comes only from the server
 * session/company context, including for metadata writes without Google effects. */
export async function googleEventsHttp(request:Request,action:(scope:GoogleWorkspace)=>Promise<unknown>,mutation=false,status=200):Promise<NextResponse>{
 try{
  return await runWithCompanyRequest(async()=>{
   const session=await getSession();if(!session||session.role!=="client")throw Error("GOOGLE_EVENT_AUTH_REQUIRED");
   const owner=session.sub;
   if(mutation){
    const origin=process.env.APP_ORIGIN||process.env.OPEN_FINANCE_APP_ORIGIN;
    if((process.env.NODE_ENV==="production"&&!origin)||!isSameOrigin(request,origin))throw Error("GOOGLE_EVENT_ORIGIN_DENIED");
   }
   const scope=googleWorkspaceFromContext(owner,await companyScopeFor(owner)),key=assertGoogleWorkspaceHeader(request,scope,mutation);
   return NextResponse.json(await action(scope),{status,headers:{...headers,"X-Zelo-Workspace-Key":key}});
  });
 }catch(error){return failure(error);}
}
/** Every allowed query is required exactly once; [] rejects all query keys. */
export function googleEventsQuery(request:Request,keys:readonly string[]=[]):Readonly<Record<string,string>>{
 try{
  const query=new URL(request.url).searchParams;
  if([...query.keys()].some(key=>!keys.includes(key))||keys.some(key=>query.getAll(key).length!==1))throw Error();
  return Object.freeze(Object.fromEntries(keys.map(key=>[key,query.get(key)!])));
 }catch{throw Error("GOOGLE_EVENT_INPUT_INVALID");}
}
/** Routes separately validate field values. Bound actual bytes and snapshot the
 * schema before reading; optional fields are never invented in the projection. */
export async function googleEventsBody(request:Request,keys:readonly string[],requiredKeys:readonly string[]=keys):Promise<Readonly<Record<string,unknown>>>{
 try{
  const allowed=[...keys],required=[...requiredKeys];
  if(allowed.some(key=>typeof key!=="string"||!key)||new Set(allowed).size!==allowed.length||required.some(key=>!allowed.includes(key))||new Set(required).size!==required.length)throw Error();
  if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type")??""))throw Error();
  const bytes=await readBankBody(request,32768),value:unknown=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));
  if(!value||typeof value!=="object"||Array.isArray(value))throw Error();const row=value as Record<string,unknown>;
  if(Object.keys(row).some(key=>!allowed.includes(key))||required.some(key=>!Object.hasOwn(row,key)))throw Error();
  return Object.freeze(Object.fromEntries(allowed.filter(key=>Object.hasOwn(row,key)).map(key=>[key,row[key]])));
 }catch{throw Error("GOOGLE_EVENT_INPUT_INVALID");}
}
