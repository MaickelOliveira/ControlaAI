/** Database request boundary shared by web, WhatsApp and server jobs. */
export type CompanyScope={userId:string;companyId:string;mode:"personal"|"business";allowBusiness?:boolean;allowPersonal?:boolean;companyName?:string;customCategoriesExpense?:string[];customCategoriesIncome?:string[];archivedCompanyIds?:string[]};
export const COMPANY_MODE_TABLES=new Set(["accounts","finances","tasks","reminders","goals","vehicles","recurring_transactions"]);
export const COMPANY_SHARED_TABLES=new Set(["appointments","meets","drive_folders","drive_files"]);
export const COMPANY_BUSINESS_TABLES=new Set(["employees","customers"]);
export const COMPANY_TABLES=new Set([...COMPANY_MODE_TABLES,...COMPANY_SHARED_TABLES,...COMPANY_BUSINESS_TABLES,"card_invoices"]);

export function scopeCompanyRequest(input:URL,options:RequestInit,scope:CompanyScope):{url:URL;init:RequestInit} {
 const url=new URL(input),init={...options};const table=url.pathname.split("/").at(-1)!;
 if(!url.pathname.startsWith("/rest/v1/")||!COMPANY_TABLES.has(table))return {url,init};
 const owner=url.searchParams.get("user_id");
 if(owner&&owner!==`eq.${scope.userId}`)throw Error("COMPANY_OWNER_MISMATCH");
 url.searchParams.set("user_id",`eq.${scope.userId}`);
 const method=(options.method??"GET").toUpperCase();
 const headers=new Headers(options.headers);
 if(headers.get("prefer")?.includes("resolution=merge-duplicates"))throw Error("COMPANY_UPSERT_DENIED");
 headers.set("x-zelo-owner",scope.userId);
 headers.set("x-zelo-company",scope.companyId);
 headers.set("x-zelo-business-access",String(scope.allowBusiness!==false));
 init.headers=headers;
 const businessAllowed=scope.allowBusiness!==false,personalAllowed=scope.allowPersonal!==false;
 if(!businessAllowed&&!personalAllowed||scope.mode==="personal"&&!personalAllowed)throw Error("COMPANY_ACCESS_DENIED");
 let predicate:string;
 if(COMPANY_MODE_TABLES.has(table))predicate=businessAllowed?(personalAllowed?`or(and(mode.eq.personal,company_id.is.null),and(mode.eq.business,company_id.eq.${scope.companyId}))`:`and(mode.eq.business,company_id.eq.${scope.companyId})`):"and(mode.eq.personal,company_id.is.null)";
 else if(COMPANY_SHARED_TABLES.has(table))predicate=scope.mode==="business"&&businessAllowed?`company_id.eq.${scope.companyId}`:"or(company_id.is.null,workspace_legacy.eq.true)";
 else if(table==="card_invoices")predicate=businessAllowed?(personalAllowed?`or(company_id.is.null,company_id.eq.${scope.companyId})`:`company_id.eq.${scope.companyId}`):"company_id.is.null";
 else {if(!businessAllowed)throw Error("COMPANY_ACCESS_DENIED");predicate=`company_id.eq.${scope.companyId}`;}
 if(predicate.startsWith("company_id.eq.")&&!url.searchParams.has("company_id"))url.searchParams.set("company_id",`eq.${scope.companyId}`);
 else {
  const prior=url.searchParams.get("and");url.searchParams.set("and",`(${prior?`${prior.slice(1,-1)},`:""}${predicate})`);
 }
 if(scope.archivedCompanyIds?.length){
  if(scope.archivedCompanyIds.some(id=>! /^[0-9a-f-]{36}$/i.test(id)))throw Error("COMPANY_INVALID");
  const prior=url.searchParams.get("and");url.searchParams.set("and",`(${prior?`${prior.slice(1,-1)},`:""}or(company_id.is.null,company_id.not.in.(${scope.archivedCompanyIds.join(",")})))`);
 }
 if(method==="POST"||method==="PATCH"){
  if(typeof options.body!=="string")throw Error("COMPANY_PAYLOAD_INVALID");
  const parsed:unknown=JSON.parse(options.body);
  const assign=(value:unknown)=>{
   if(!value||typeof value!=="object"||Array.isArray(value))throw Error("COMPANY_PAYLOAD_INVALID");
   const row={...value} as Record<string,unknown>;
   if(row.user_id!==undefined&&row.user_id!==scope.userId)throw Error("COMPANY_OWNER_MISMATCH");
   if(row.company_id!==undefined)throw Error("COMPANY_REASSIGNMENT_DENIED");
   if(row.workspace_legacy!==undefined)throw Error("COMPANY_REASSIGNMENT_DENIED");
   const mode=COMPANY_MODE_TABLES.has(table)?(row.mode??(method==="POST"?"personal":undefined)):COMPANY_BUSINESS_TABLES.has(table)?"business":scope.mode;
   if(mode==="business"&&!businessAllowed)throw Error("COMPANY_ACCESS_DENIED");
   if(mode==="personal"&&!personalAllowed)throw Error("COMPANY_ACCESS_DENIED");
   if(method==="POST"){
    row.user_id=scope.userId;
    // Invoice scope is also checked against the parent account by its trigger.
    row.company_id=table==="card_invoices"?null:mode==="business"?scope.companyId:null;
    if(COMPANY_SHARED_TABLES.has(table))row.workspace_legacy=false;
   }else if(COMPANY_MODE_TABLES.has(table)&&row.mode!==undefined){
    if(row.mode!=="business"&&row.mode!=="personal")throw Error("COMPANY_MODE_INVALID");
    row.company_id=row.mode==="business"?scope.companyId:null;
   }
   return row;
  };
  init.body=JSON.stringify(Array.isArray(parsed)?parsed.map(assign):assign(parsed));
 }
 return {url,init};
}
