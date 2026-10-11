import "server-only";
import type {OpenFinanceScope} from "./open-finance-access";
import {openFinanceRpc} from "./open-finance-http";
import {polpObject,polpUuid,type PolpObject} from "./polp-production";
import {revokeProductionConsent} from "./open-finance-revocation";

async function cancelConsent(scope:OpenFinanceScope,id:string,connection:PolpObject) {
  if(connection.status==="revoked")return;
  // Block imports before requesting cancellation; an uncertain result stays visible.
  await openFinanceRpc(scope,"zelo_of_set_status",{p_id:id,p_status:"revoking",p_provider_status:null});
  const providerStatus=await revokeProductionConsent(polpUuid(connection.external_consent_id),scope.userId);
  await openFinanceRpc(scope,"zelo_of_set_status",{p_id:id,p_status:"revoked",p_provider_status:providerStatus});
}
export async function disconnectBank(scope:OpenFinanceScope,connectionId:string) {
  const id=polpUuid(connectionId);
  const connection=polpObject(await openFinanceRpc(scope,"zelo_of_connection",{p_id:id}));
  await cancelConsent(scope,id,connection);
}
export async function removeBankAttempt(scope:OpenFinanceScope,connectionId:string) {
  const id=polpUuid(connectionId);
  // Database lock prevents a pending authorization becoming active between checks.
  const connection=polpObject(await openFinanceRpc(scope,"zelo_of_begin_removal",{p_id:id}));
  await cancelConsent(scope,id,connection);
  await openFinanceRpc(scope,"zelo_of_connection_visibility",{p_id:id,p_archived:true});
}
