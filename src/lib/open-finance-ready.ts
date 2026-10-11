import "server-only";
import type { OpenFinanceScope } from "./open-finance-access";
import { openFinanceRpc } from "./open-finance-http";
import {isPublicOpenFinanceEnabled} from "./open-finance-access";
/** Do not create a real consent until storage and its durable worker can accept it. */
export async function isBankConnectReady(scope:OpenFinanceScope):Promise<boolean> {
  // Private setup may prepare a pending consent, but never releases its URL until verified.
  const authorizationConfigured=!!process.env.OPEN_FINANCE_AUTH_HOSTS?.trim() || process.env.OPEN_FINANCE_PREVIEW_ONLY==="true" || (isPublicOpenFinanceEnabled()&&process.env.OPEN_FINANCE_PROVIDER_AUTH_URLS_ENABLED==="true");
  if(process.env.OPEN_FINANCE_CONNECT_ENABLED!=="true" || process.env.OPEN_FINANCE_SYNC_ENABLED!=="true" || !authorizationConfigured || (process.env.POLP_WEBHOOK_SIGNING_SECRET?.length??0)<32 || (process.env.OPEN_FINANCE_SYNC_CRON_SECRET?.length??0)<32)return false;
  try {
    const origin=new URL(process.env.OPEN_FINANCE_APP_ORIGIN??"");
    if(origin.protocol!=="https:" || origin.origin!==process.env.OPEN_FINANCE_APP_ORIGIN)return false;
    const capabilities=await openFinanceRpc(scope,"zelo_of_capabilities");
    return !!capabilities && typeof capabilities==="object" && "version" in capabilities && ["private-sync-v4","multi-user-sync-v5"].includes(String(capabilities.version)) && "worker_recent" in capabilities && capabilities.worker_recent===true;
  }catch{return false;}
}
