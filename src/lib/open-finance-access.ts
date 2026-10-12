import "server-only";
import {isSameOrigin} from "./request-origin";
import { getSupabase } from "./supabase";
import type { User } from "./users";
import {multiCompanyEnabled,requireCompany,companyContextData} from "./companies";
import {companyScopeFor,isCompanyRequestContext} from "./company-context";

export type OpenFinanceScope = { userId: string; mode: "personal" | "business"; environment: "production"; companyId?:string; companyName?:string };
export type OpenFinanceIdentity = Pick<User, "id" | "email" | "plan" | "activeMode"> & Partial<Pick<User,"status">>;

export function isPublicOpenFinanceEnabled():boolean {
  return process.env.OPEN_FINANCE_ENABLED==="true" && process.env.OPEN_FINANCE_PUBLIC_ENABLED==="true" && process.env.OPEN_FINANCE_PREVIEW_ONLY!=="true";
}

export function canEnrollOpenFinance(user:OpenFinanceIdentity,mode:string|null|undefined):boolean {
  return isPublicOpenFinanceEnabled() && user.status==="active"
    && !!process.env.POLP_PRODUCTION_CLIENT_ID && !!process.env.POLP_PRODUCTION_CLIENT_SECRET
    && (mode==="personal" || (mode==="business" && canUseOpenFinanceBusiness(user)));
}

/** Private owner testing does not upgrade the production plan or active mode. */
export function canUseOpenFinanceBusiness(user: Pick<User, "email" | "plan">): boolean {
  if (user.plan === "business") return true;
  const owner = process.env.OPEN_FINANCE_OWNER_EMAIL?.trim().toLowerCase();
  const privateBusiness = process.env.OPEN_FINANCE_PREVIEW_ONLY === "true"
    && process.env.OPEN_FINANCE_PREVIEW_BUSINESS_ENABLED === "true";
  const officialOwnerBusiness = process.env.OPEN_FINANCE_ENABLED === "true"
    && process.env.OPEN_FINANCE_OWNER_BUSINESS_ENABLED === "true";
  return (privateBusiness || officialOwnerBusiness)
    && !!owner && user.email.trim().toLowerCase() === owner;
}

/** Identity comes from the current database user, never the JWT or request body.
 * Public availability still requires each holder's recorded Brazilian eligibility. */
export async function getOpenFinanceAccess(user: OpenFinanceIdentity, requestedMode?: string | null, options:{throwOnStorageError?:boolean;companyId?:string|null}={}): Promise<OpenFinanceScope | null> {
  if (process.env.OPEN_FINANCE_ENABLED !== "true") return null;
  const ownerEmail = process.env.OPEN_FINANCE_OWNER_EMAIL?.trim().toLowerCase();
  const owner=!!ownerEmail && user.email.trim().toLowerCase()===ownerEmail;
  if(isPublicOpenFinanceEnabled() ? user.status!=="active" : !owner)return null;
  if (!process.env.POLP_PRODUCTION_CLIENT_ID || !process.env.POLP_PRODUCTION_CLIENT_SECRET) return null;
  const mode = requestedMode ?? user.activeMode;
  if (mode !== "personal" && mode !== "business") return null;
  if (mode === "business" && !canUseOpenFinanceBusiness(user)) return null;
  try {
    const { data, error } = await getSupabase().rpc("zelo_of_access", { p_user: user.id });
    if(error)throw Error("OF_ACCESS_UNAVAILABLE");
    if (!data || data.enabled !== true || data.country_code !== "BR" || !data.country_verified_at) return null;
    if(multiCompanyEnabled()){
      // Worker/webhook targets come from the database; web and WhatsApp use their verified context.
      const context=options.companyId===undefined?await companyScopeFor(user.id):undefined;
      if(mode==="business"&&context?.allowBusiness===false)return null;
      // This request already checked the selected company against its owner.
      // Explicit worker/WhatsApp scopes retain their separate database check.
      if(context&&isCompanyRequestContext())return {userId:user.id,mode,environment:"production",companyId:context.companyId,companyName:context.companyName};
      const company=mode==="business"?await requireCompany(user.id,options.companyId??context?.companyId):(await companyContextData(user.id,options.companyId??context?.companyId,"personal")).company;
      return {userId:user.id,mode,environment:"production",companyId:company.id,companyName:company.name};
    }
    return { userId: user.id, mode, environment: "production" };
  } catch { if(options.throwOnStorageError)throw Error("OF_ACCESS_UNAVAILABLE");return null; }
}

export function requireOpenFinanceOrigin(request: Request): void {
  if (!isSameOrigin(request,process.env.OPEN_FINANCE_APP_ORIGIN)) {
    throw new Error("INVALID_ORIGIN");
  }
}
