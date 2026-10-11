import "server-only";
import {AsyncLocalStorage} from "node:async_hooks";
import {cookies} from "next/headers";
import {getAdminSession,getSessionWithUser} from "./auth";
import {COMPANY_COOKIE,multiCompanyEnabled,requireCompany} from "./companies";
import type {CompanyScope} from "./company-scope-policy";
import {selectedCompanyId} from "./company-selection";
export type CompanyDatabaseScope = CompanyScope | { trusted: true };
const contextKey=Symbol.for("zelo.companyAsyncContext");
const registry=globalThis as typeof globalThis & {[contextKey]?:AsyncLocalStorage<{scope?:CompanyDatabaseScope}>};
const context=registry[contextKey]??(registry[contextKey]=new AsyncLocalStorage<{scope?:CompanyDatabaseScope}>());
export function runWithCompanyContext<T>(callback:()=>Promise<T>):Promise<T>{return context.run({},callback);}
/** Only authenticated cron/admin orchestration may deliberately scan all workspaces. */
export function runWithTrustedCompanyJob<T>(callback:()=>Promise<T>):Promise<T>{return context.run({scope:{trusted:true}},callback);}
export function currentCompanyContext():CompanyScope|undefined {const scope=context.getStore()?.scope;return scope&&!("trusted" in scope)?scope:undefined;}
export function setCompanyContext(scope:CompanyScope):void {const state=context.getStore();if(!state)throw Error("COMPANY_CONTEXT_MISSING");state.scope=scope;}
export async function resolveCompanyContext():Promise<CompanyDatabaseScope|undefined>{
 if(!multiCompanyEnabled())return undefined;
 const local=context.getStore();if(local){if(!local.scope)throw Error("COMPANY_CONTEXT_MISSING");return local.scope;}
 let jar:Awaited<ReturnType<typeof cookies>>;
 try {jar=await cookies();}catch{throw Error("COMPANY_CONTEXT_MISSING");}
 if(!jar.get("ca_session")){const admin=await getAdminSession();if(admin?.role==="admin")return {trusted:true};}
 if(!jar.get("ca_session"))throw Error("COMPANY_ACCESS_DENIED");
 const auth=await getSessionWithUser();if(!auth||auth.session.role!=="client")throw Error("COMPANY_ACCESS_DENIED");
 const company=await requireCompany(auth.user.id,selectedCompanyId(auth.user.id,jar.get(COMPANY_COOKIE)?.value));
 return {userId:auth.user.id,companyId:company.id,mode:auth.user.activeMode,companyName:company.name,customCategoriesExpense:company.customCategoriesExpense,customCategoriesIncome:company.customCategoriesIncome};
}
export async function companyScopeFor(userId:string):Promise<CompanyScope|undefined>{
 const current=await resolveCompanyContext();if(!current||"trusted" in current)return undefined;if(current.userId!==userId)throw Error("COMPANY_OWNER_MISMATCH");return current;
}
