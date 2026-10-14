import "server-only";
import {getSession} from "./auth";
import {companyScopeFor,runWithCompanyRequest} from "./company-context";
import {googleWorkspaceFromContext} from "./google-workspace-policy";
import {googleSettingsWorkspaceView} from "./google-settings-service";
import type {GoogleSettingsTarget} from "./google-settings-client";

/** A server-rendered display/correlation snapshot only. Provider actions still
 * independently resolve authenticated request scope and exact binding revision. */
export async function loadGoogleSettingsPageTarget():Promise<GoogleSettingsTarget|null>{
 try{
  return await runWithCompanyRequest(async()=>{
   const session=await getSession();if(!session||session.role!=="client")return null;const owner=session.sub;
   const context=await companyScopeFor(owner),scope=googleWorkspaceFromContext(owner,context);
   const label=scope.mode==="personal"?"Pessoal":context?.companyName;
   if(typeof label!=="string"||!label.trim()||label.length>100||/\p{Cc}/u.test(label))return null;
   return Object.freeze({...googleSettingsWorkspaceView(scope),label});
  });
 }catch{return null;}
}
