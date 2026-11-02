import "server-only";
import {openFinanceRpc} from "./open-finance-http";
import type {OpenFinanceScope} from "./open-finance-access";
import {polpObject,polpProductionPage,polpUuid} from "./polp-production";
/** Explicit read-only diagnostics; never called by dashboard polling. */
export async function readProductionSyncStatus(scope:OpenFinanceScope,id:string){
 const connection=polpObject(await openFinanceRpc(scope,"zelo_of_connection",{p_id:polpUuid(id)}));
 if(connection.status!=="active"||connection.archived_at)throw Error("CONSENT_INACTIVE");
 const consent=polpUuid(connection.external_consent_id),items:Array<{resource:string;lastSync:string|null;nextSync:string|null}>=[],seen=new Set<string>();
 let cursor:string|null=null;
 const date=(value:unknown)=>{if(value===null)return null;if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}T/.test(value)||!Number.isFinite(Date.parse(value)))throw Error("INVALID_SYNC_STATUS");return value;};
 for(let page=0;page<4;page++){
  const result=await polpProductionPage(`/consents/${consent}/sync-schedules`,cursor);
  for(const row of result.data){
   if(row.consent_id!==consent||typeof row.resource!=="string"||!/^[a-z][a-z_.]{0,79}$/.test(row.resource))throw Error("INVALID_SYNC_STATUS");
   items.push({resource:row.resource,lastSync:date(row.last_sync_at),nextSync:date(row.next_sync_at)});
  }
  if(!result.nextCursor)return {items};
  if(seen.has(result.nextCursor))throw Error("INVALID_SYNC_STATUS");seen.add(result.nextCursor);cursor=result.nextCursor;
 }
 throw Error("SYNC_STATUS_LIMIT");
}
