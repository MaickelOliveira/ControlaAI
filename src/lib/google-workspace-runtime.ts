import "server-only";
import type {google} from "googleapis";
import type {Credentials} from "google-auth-library";
import {getAuthClient} from "./google-oauth";
import {getSupabase} from "./supabase";
import {encryptField,decryptField} from "./crypto-store";
import {googleOAuthBindingVersion,googleOAuthClientFingerprint} from "./google-oauth-state";
import {googleWorkspaceKey,type GoogleWorkspace} from "./google-workspace-policy";
import {googleBindingFromStorage,googleCredentialCiphertext,googleCredentialValue,type GoogleBinding} from "./google-binding-store";

export type GoogleBindingReference=Readonly<{bindingId:string;grantId:string}>;
type RuntimeRecord={binding:GoogleBinding;grantVersion:string;expiresAt:string;accessCiphertext:string;refreshCiphertext:string};
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function record(value:unknown):Record<string,unknown>{if(!value||typeof value!=="object"||Array.isArray(value))throw Error();return value as Record<string,unknown>;}
function reference(value:GoogleBindingReference|null):GoogleBindingReference|null{
 if(value===null)return null;const row=record(value);
 if(typeof row.bindingId!=="string"||!UUID.test(row.bindingId)||typeof row.grantId!=="string"||!UUID.test(row.grantId))throw Error();
 return Object.freeze({bindingId:row.bindingId.toLowerCase(),grantId:row.grantId.toLowerCase()});
}
async function rpc(name:string,args:Record<string,unknown>):Promise<unknown>{
 try{const {data,error}=await getSupabase().rpc(name,args);if(error)throw Error();return data;}
 catch{throw Error("GOOGLE_RUNTIME_STORAGE_UNAVAILABLE");}
}
async function load(scope:GoogleWorkspace,fingerprint:string):Promise<RuntimeRecord>{
 const data=await rpc("zelo_google_runtime_get",{p_user_id:scope.userId,p_mode:scope.mode,p_company_id:scope.companyId,p_client_fingerprint:fingerprint});
 if(data===null)throw Error("GOOGLE_RUNTIME_NOT_CONNECTED");
 try{
  const row=record(data),binding=googleBindingFromStorage(row.binding,scope),grant=record(row.grant);
  if(binding.unlinkedAt!==null||grant.id!==binding.grantId||grant.user_id!==scope.userId||grant.client_fingerprint!==fingerprint)throw Error();
  const grantVersion=googleOAuthBindingVersion(grant.version);
  if(grantVersion==="0"||typeof grant.expires_at!=="string"||!Number.isFinite(Date.parse(grant.expires_at)))throw Error();
  return {binding,grantVersion,expiresAt:grant.expires_at,accessCiphertext:googleCredentialCiphertext(grant.access_ciphertext),refreshCiphertext:googleCredentialCiphertext(grant.refresh_ciphertext)};
 }catch{throw Error("GOOGLE_RUNTIME_STORAGE_INVALID");}
}
function unchanged(expected:GoogleBinding,actual:GoogleBinding):void{
 if(expected.id!==actual.id||expected.grantId!==actual.grantId||expected.version!==actual.version)throw Error("GOOGLE_RUNTIME_CHANGED");
}
function usable(entry:RuntimeRecord):boolean{return Date.parse(entry.expiresAt)>Date.now()+300_000;}
function decoded(value:string):string{return googleCredentialValue(decryptField(value));}

/** Scope/reference must come from an authenticated request or authorized event.
 * The trusted server callback must return an allowlisted DTO, never SDK objects.
 * No production caller is installed yet; legacy credentials are never queried. */
export async function withGoogleWorkspaceClient<T>(scope:GoogleWorkspace,expected:GoogleBindingReference|null,operation:(auth:InstanceType<typeof google.auth.OAuth2>,binding:GoogleBinding)=>Promise<T>):Promise<T>{
 let client:Awaited<ReturnType<typeof getAuthClient>>|undefined;
 try{
  googleWorkspaceKey(scope);const selected=Object.freeze({userId:scope.userId.toLowerCase(),mode:scope.mode,companyId:scope.companyId?.toLowerCase()??null}),target=reference(expected);
  if(typeof operation!=="function")throw Error();
  client=await getAuthClient();if(typeof client._clientId!=="string")throw Error();
  const fingerprint=googleOAuthClientFingerprint(client._clientId),original=await load(selected,fingerprint);
  if(target&&(target.bindingId!==original.binding.id||target.grantId!==original.binding.grantId))throw Error("GOOGLE_RUNTIME_CHANGED");
  if(!usable(original)){
   client.setCredentials({access_token:decoded(original.accessCiphertext),refresh_token:decoded(original.refreshCiphertext),expiry_date:Date.parse(original.expiresAt)});
   // The SDK's credentials wrapper restores the old refresh token after emitting
   // the response. Capture a returned rotation synchronously before that mutation.
   let rotatedRefresh:unknown;const capture=(tokens:Credentials)=>{rotatedRefresh=tokens.refresh_token??undefined;};
   client.once("tokens",capture);let credentials:Credentials;
   try{({credentials}=await client.refreshAccessToken());}finally{client.removeListener("tokens",capture);}
   const access=googleCredentialValue(credentials.access_token),returnedRefresh=rotatedRefresh??credentials.refresh_token;
   const refresh=returnedRefresh==null?decoded(original.refreshCiphertext):googleCredentialValue(returnedRefresh);
   if(typeof credentials.expiry_date!=="number"||!Number.isSafeInteger(credentials.expiry_date)||credentials.expiry_date<=Date.now())throw Error();
   const accessCiphertext=encryptField(access),refreshCiphertext=encryptField(refresh);if(!accessCiphertext||!refreshCiphertext)throw Error();
   const result=await rpc("zelo_google_grant_refresh",{p_user_id:selected.userId,p_mode:selected.mode,p_company_id:selected.companyId,p_grant_id:original.binding.grantId,p_client_fingerprint:fingerprint,p_grant_version:original.grantVersion,p_access_ciphertext:accessCiphertext,p_refresh_ciphertext:refreshCiphertext,p_expires_at:new Date(credentials.expiry_date).toISOString()});
   if(result!==true&&result!==false)throw Error("GOOGLE_RUNTIME_STORAGE_INVALID");
  }
  const committed=await load(selected,fingerprint);unchanged(original.binding,committed.binding);
  if(!usable(committed))throw Error("GOOGLE_RUNTIME_CHANGED");
  client.setCredentials({access_token:decoded(committed.accessCiphertext),expiry_date:Date.parse(committed.expiresAt)});
  client.refreshHandler=undefined;client.eagerRefreshThresholdMillis=0;client.forceRefreshOnFailure=false;
  return await operation(client,committed.binding);
 }catch(error){
  const safe=["GOOGLE_RUNTIME_NOT_CONNECTED","GOOGLE_RUNTIME_CHANGED","GOOGLE_RUNTIME_STORAGE_UNAVAILABLE","GOOGLE_RUNTIME_STORAGE_INVALID"];
  throw Error(error instanceof Error&&safe.includes(error.message)?error.message:"GOOGLE_RUNTIME_FAILED");
 }finally{client?.setCredentials({});}
}
