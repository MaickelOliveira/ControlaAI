import "server-only";
import {getSupabase} from "./supabase";
import {polpObject,polpUuid} from "./polp-production";
import {revokeProductionConsent} from "./open-finance-revocation";

export function isBankRetirementEnabled() {
  return process.env.OPEN_FINANCE_ENABLED==="true" && process.env.OPEN_FINANCE_PREVIEW_ONLY!=="true"
    && process.env.OPEN_FINANCE_RETIREMENT_ENABLED!=="false"
    && !!process.env.POLP_PRODUCTION_CLIENT_ID && !!process.env.POLP_PRODUCTION_CLIENT_SECRET;
}

/** Leases and subscription changes live in PostgreSQL and survive app restarts. */
export async function runBankRetirement() {
  const db=getSupabase();
  const {data,error}=await db.rpc("zelo_of_claim_retirement");
  if(error)throw Error("OF_RETIREMENT_UNAVAILABLE");
  if(!data)return "idle" as const;
  const claim=polpObject(data),id=polpUuid(claim.id),lease=polpUuid(claim.retirement_lease_token);
  const external=polpUuid(claim.external_consent_id),user=polpUuid(claim.user_id);
  let providerStatus:string|null=null,errorCode:string|null=null;
  try { providerStatus=await revokeProductionConsent(external,user); }
  catch(error) {
    const code=error instanceof Error?error.message:"";
    errorCode=/^(?:POLP_(?:HTTP_\d{3}|UNAVAILABLE)|NOT_CONFIGURED|OF_CANCELLATION_UNCONFIRMED)$/.test(code)?code:"OF_CANCELLATION_UNCONFIRMED";
  }
  const finished=await db.rpc("zelo_of_finish_retirement",{p_id:id,p_lease:lease,p_error:errorCode,p_provider_status:providerStatus});
  if(finished.error)throw Error("OF_RETIREMENT_UNAVAILABLE");
  return errorCode?"failed" as const:"processed" as const;
}
