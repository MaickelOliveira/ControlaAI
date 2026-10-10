import "server-only";
import { openFinanceRpc } from "./open-finance-http";
import type { OpenFinanceScope } from "./open-finance-access";
import { normalizeBills, normalizeCredit, normalizeLimits, normalizeMovements, normalizeReserves, normalizeResource, RESOURCE_FAMILIES, type ResourceFamily } from "./open-finance-normalize";
import { polpObject, polpProductionPage, polpProductionRequest, polpExternalId, polpUuid, type PolpObject } from "./polp-production";
import type { BankJobSpec } from "./open-finance-webhook";

const productFor = (family:ResourceFamily) => family==="accounts"?"ACCOUNT":family==="credit-cards"?"CREDIT_CARD_ACCOUNT":family==="loans"||family==="financings"?"CREDIT_OPERATIONS":"INVESTMENTS";
function catalogJobs(consentId:string,products:unknown): BankJobSpec[] {
  if (!Array.isArray(products)) throw new Error("INVALID_CONSENT_PRODUCTS");
  return RESOURCE_FAMILIES.filter(family=>products.includes(productFor(family))).map(family=>({kind:"catalog",family,external_resource_id:consentId,window:{}}));
}
export async function enqueueConsentCheck(scope:OpenFinanceScope,id:string):Promise<void> {
  const connection=polpObject(await openFinanceRpc(scope,"zelo_of_connection",{p_id:polpUuid(id)}));
  await openFinanceRpc(scope,"zelo_of_retry_failed",{p_connection:id});
  await openFinanceRpc(scope,"zelo_of_enqueue",{p_connection:id,p_job:{kind:"consent",family:"consents",external_resource_id:polpUuid(connection.external_consent_id),window:{}}});
}
async function consentPage(scope:OpenFinanceScope,job:PolpObject) {
  const id=polpUuid(job.external_consent_id);
  const consent=polpObject((await polpProductionRequest(`/consents/${id}`)).data);
  if (consent.id!==id || consent.cliente_user_id!==scope.userId || consent.institution_id!==job.institution_id) throw new Error("CONSENT_IDENTITY_MISMATCH");
  const status={AUTHORISED:"active",AWAITING_AUTHORIZATION:"pending",REJECTED:"error",EXPIRED:"expired"}[String(consent.status)];
  if (!status) throw new Error("INVALID_CONSENT_STATUS");
  const notes:string[]=[];
  if(consent.execution_status==="AWAITING_RESOURCES")notes.push("AWAITING_RESOURCES");
  if(consent.execution_status==="PARTIAL_SUCCESS" || (Array.isArray(consent.flags)&&consent.flags.length))notes.push("SOURCE_PARTIAL");
  if(status==="active") {
    const inventory=(await polpProductionRequest(`/consents/${id}/resources`)).data;
    if(!Array.isArray(inventory)||inventory.length>1000)throw new Error("INVALID_RESPONSE");
    for(const value of inventory) {
      const r=polpObject(value);
      if(r.status!=="AVAILABLE" || r.resource_id==null)notes.push("RESOURCES_PENDING");
      if(["UNARRANGED_ACCOUNT_OVERDRAFT","INVOICE_FINANCING"].includes(String(r.type)))notes.push("UNSUPPORTED_CREDIT_DETAILS");
    }
  }
  const requested=Array.isArray(job.scopes)?job.scopes:[];
  const products=consent.products;
  if(!Array.isArray(products) || requested.length===0 || requested.some(p=>!products.includes(p)))throw new Error("INVALID_CONSENT_PRODUCTS");
  return {rows:{consent_status:status,provider_status:consent.status,sync_notes:[...new Set(notes)]},nextCursor:null,children:status==="active"?catalogJobs(id,requested):[]};
}
async function resourcePage(job:PolpObject) {
  const family=String(job.family) as ResourceFamily;
  if(!RESOURCE_FAMILIES.includes(family))throw new Error("INVALID_JOB");
  const target=polpExternalId(job.external_resource_id), kind=String(job.kind);
  const path=kind==="catalog"?`/consents/${polpUuid(job.external_consent_id)}/${family}`:kind==="transactions"?`/${family}/${target}/transactions`:kind==="bills"?`/credit-cards/${target}/bills`:kind==="reserves"?`/accounts/${target}/reserved-balances`:null;
  if(!path)throw new Error("INVALID_JOB");
  const page=await polpProductionPage(path,job.cursor==null?null:String(job.cursor),polpObject(job.filter_window) as Record<string,string>);
  const rows:Record<string,PolpObject[]>={},children:Array<BankJobSpec&{initial_only?:boolean}>=[];
  if(kind==="catalog") {
    rows.resources=[];rows.limits=[];rows.credit=[];
    for(const row of page.data) {
      if(row.consent_id!=null && row.consent_id!==job.external_consent_id)throw new Error("CONSENT_IDENTITY_MISMATCH");
      const resource=normalizeResource(family,row);rows.resources.push(resource);
      const child=(kind:BankJobSpec["kind"],initialOnly=false)=>children.push({kind,family,external_resource_id:String(resource.external_id),window:{},initial_only:initialOnly});
      if(family==="credit-cards"){rows.limits.push(...normalizeLimits(row));child("bills",true);child("transactions",true);}
      else if(family==="loans"||family==="financings")rows.credit.push(normalizeCredit(family,row));
      else {child("transactions",true);if(family==="accounts"&&row.balance&&polpObject(row.balance).has_reserved_balance===true)child("reserves");}
    }
  }else if(kind==="transactions")rows.movements=normalizeMovements(family,target,page.data);
  else if(kind==="bills")rows.bills=normalizeBills(target,page.data);
  else rows.resources=normalizeReserves(target,page.data);
  return {rows,nextCursor:page.nextCursor,children};
}

/** One bounded page per invocation. Acknowledged webhook work stays in PostgreSQL. */
export async function runBankSyncPage(scope:OpenFinanceScope):Promise<"idle"|"processed"|"failed"> {
  const claimed=await openFinanceRpc(scope,"zelo_of_claim");
  if(!claimed)return "idle";
  const job=polpObject(claimed), id=polpUuid(job.id), lease=polpUuid(job.lease_token);
  try {
    const result=job.kind==="consent"?await consentPage(scope,job):await resourcePage(job);
    await openFinanceRpc(scope,"zelo_of_commit_page",{p_job:id,p_lease:lease,p_rows:result.rows,p_next:result.nextCursor,p_children:result.children});
    return "processed";
  }catch(error){
    const code=error instanceof Error&&/^[A-Z0-9_]{1,80}$/.test(error.message)?error.message:"OF_SYNC_FAILED";
    await openFinanceRpc(scope,"zelo_of_fail_job",{p_job:id,p_lease:lease,p_error:code});
    return "failed";
  }
}
