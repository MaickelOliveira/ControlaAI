import "server-only";
import {polpObject,polpProductionRequest,polpUuid} from "./polp-production";

/** A lost DELETE response may be resolved by one ownership-checked status read. */
export async function revokeProductionConsent(consentId:string,userId:string):Promise<string> {
  const id=polpUuid(consentId),user=polpUuid(userId);
  try {
    const result=await polpProductionRequest(`/consents/${id}`,"DELETE");
    if(result.message!=="Consentimento revogado.")throw Error("OF_CANCELLATION_UNCONFIRMED");
    return "REVOKED";
  } catch(error) {
    try {
      const consent=polpObject((await polpProductionRequest(`/consents/${id}`)).data);
      if(consent.id===id && consent.cliente_user_id===user && (consent.status==="EXPIRED"||consent.status==="REJECTED"))return consent.status;
    } catch { /* Missing or unavailable source records are not confirmation. */ }
    throw error;
  }
}
