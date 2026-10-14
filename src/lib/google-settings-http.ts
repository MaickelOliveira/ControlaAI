import "server-only";
import {NextResponse} from "next/server";
import {getSession} from "./auth";
import {companyScopeFor,runWithCompanyRequest} from "./company-context";
import {googleWorkspaceFromContext,type GoogleWorkspace} from "./google-workspace-policy";
import {isSameOrigin} from "./request-origin";
import {readBankBody} from "./open-finance-body";

const headers={"Cache-Control":"private, no-store"};
const errors:Record<string,readonly [number,string]>={
 GOOGLE_SETTINGS_AUTH_REQUIRED:[401,"Entre na sua conta para continuar."],
 GOOGLE_SETTINGS_ORIGIN_DENIED:[403,"Origem não autorizada."],
 GOOGLE_SETTINGS_ACCESS_DENIED:[403,"Este espaço não está disponível para esta conta."],
 GOOGLE_SETTINGS_INPUT_INVALID:[400,"Confira os dados e tente novamente."],
 GOOGLE_SETTINGS_WORKSPACE_CHANGED:[409,"O espaço mudou. Atualize a página e tente novamente."],
 GOOGLE_SETTINGS_CONFLICT:[409,"A conexão mudou. Atualize a página e tente novamente."],
 GOOGLE_SETTINGS_NOT_CONNECTED:[400,"Conecte o Google neste espaço para continuar."],
 GOOGLE_SETTINGS_STORAGE_UNAVAILABLE:[503,"Não foi possível consultar a conexão. Tente novamente."],
 GOOGLE_SETTINGS_STORAGE_INVALID:[503,"Não foi possível consultar a conexão. Tente novamente."],
 GOOGLE_SETTINGS_PROVIDER_INVALID:[502,"Não foi possível consultar as agendas do Google. Tente novamente."],
 GOOGLE_SETTINGS_PROVIDER_UNAVAILABLE:[502,"Não foi possível consultar as agendas do Google. Tente novamente."],
 GOOGLE_SETTINGS_UNAVAILABLE:[503,"Não foi possível concluir a ação. Tente novamente."],
};
const denied=["COMPANY_CONTEXT_MISSING","COMPANY_OWNER_MISMATCH","COMPANY_ACCESS_DENIED","COMPANY_NOT_FOUND","COMPANY_REQUIRED","COMPANY_INVALID","GOOGLE_WORKSPACE_REQUIRED","GOOGLE_WORKSPACE_INVALID","GOOGLE_WORKSPACE_OWNER_MISMATCH","GOOGLE_WORKSPACE_ACCESS_DENIED","GOOGLE_WORKSPACE_MISMATCH"];
function failure(error:unknown):NextResponse{
 const message=error instanceof Error?error.message:"";
 const code=Object.hasOwn(errors,message)?message:denied.includes(message)?"GOOGLE_SETTINGS_ACCESS_DENIED":"GOOGLE_SETTINGS_UNAVAILABLE";
 const [status,text]=errors[code];return NextResponse.json({error:text,code},{status,headers});
}
/** HTTP actions receive authority solely from the authenticated server context.
 * Query/body values are stale-view hints; they never select an owner/workspace. */
export async function googleSettingsHttp(request:Request,action:(scope:GoogleWorkspace)=>Promise<unknown>,mutation=false):Promise<NextResponse>{
 try{
  return await runWithCompanyRequest(async()=>{
   const session=await getSession();if(!session||session.role!=="client")throw Error("GOOGLE_SETTINGS_AUTH_REQUIRED");
   const owner=session.sub;
   if(mutation){
    const origin=process.env.APP_ORIGIN||process.env.OPEN_FINANCE_APP_ORIGIN;
    if(process.env.NODE_ENV==="production"&&!origin||!isSameOrigin(request,origin))throw Error("GOOGLE_SETTINGS_ORIGIN_DENIED");
   }
   const scope=googleWorkspaceFromContext(owner,await companyScopeFor(owner));
   return NextResponse.json(await action(scope),{headers});
  });
 }catch(error){return failure(error);}
}
/** Every allowed query is required exactly once; an empty list denies all keys. */
export function googleSettingsQuery(request:Request,keys:readonly string[]):Readonly<Record<string,string>>{
 try{
  const query=new URL(request.url).searchParams;
  if([...query.keys()].some(key=>!keys.includes(key))||keys.some(key=>query.getAll(key).length!==1))throw Error();
  return Object.freeze(Object.fromEntries(keys.map(key=>[key,query.get(key)!])));
 }catch{throw Error("GOOGLE_SETTINGS_INPUT_INVALID");}
}
/** Bounded actual bytes and strict allowlist before services/provider effects. */
export async function googleSettingsBody(request:Request,keys:readonly string[]):Promise<Readonly<Record<string,unknown>>>{
 try{
  if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type")??""))throw Error();
  const bytes=await readBankBody(request,4096),value:unknown=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));
  if(!value||typeof value!=="object"||Array.isArray(value))throw Error();const row=value as Record<string,unknown>;
  if(Object.keys(row).some(key=>!keys.includes(key))||keys.some(key=>!Object.hasOwn(row,key)))throw Error();
  return Object.freeze(Object.fromEntries(keys.map(key=>[key,row[key]])));
 }catch{throw Error("GOOGLE_SETTINGS_INPUT_INVALID");}
}
