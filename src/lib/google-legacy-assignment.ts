import "server-only";
import {google} from "googleapis";
import {getAuthClient} from "./google-oauth";
import {getSupabase} from "./supabase";
import {encryptField,decryptField} from "./crypto-store";
import {googleWorkspaceKey,type GoogleWorkspace} from "./google-workspace-policy";
import {googleOAuthBindingVersion,googleOAuthClientFingerprint} from "./google-oauth-state";
import {captureGoogleGrantVersions,googleCapturedGrantVersion,googleBindingFromStorage,googleCredentialCiphertext,googleCredentialValue,type GoogleBinding} from "./google-binding-store";

export type GoogleLegacyStatus=Readonly<{exists:boolean;assigned:boolean;assignedHere:boolean}>;
const SAFE_ERRORS=["GOOGLE_LEGACY_ALREADY_ASSIGNED","GOOGLE_LEGACY_TARGET_CONNECTED","GOOGLE_LEGACY_MISSING","GOOGLE_LEGACY_CONFLICT","GOOGLE_LEGACY_STORAGE_UNAVAILABLE","GOOGLE_LEGACY_STORAGE_INVALID","GOOGLE_LEGACY_REAUTHORIZE_REQUIRED"];
function record(value:unknown):Record<string,unknown>{if(!value||typeof value!=="object"||Array.isArray(value))throw Error();return value as Record<string,unknown>;}
function text(value:unknown,max:number):string{if(typeof value!=="string"||!value.trim()||value.length>max||/\p{Cc}/u.test(value))throw Error();return value;}
function target(scope:GoogleWorkspace):GoogleWorkspace{googleWorkspaceKey(scope);return Object.freeze({userId:scope.userId.toLowerCase(),mode:scope.mode,companyId:scope.companyId?.toLowerCase()??null});}
function args(scope:GoogleWorkspace){return {p_user_id:scope.userId,p_mode:scope.mode,p_company_id:scope.companyId};}
function safe(error:unknown):Error{return Error(error instanceof Error&&SAFE_ERRORS.includes(error.message)?error.message:"GOOGLE_LEGACY_FAILED");}
async function rpc(name:string,params:Record<string,unknown>):Promise<unknown>{
 try{const {data,error}=await getSupabase().rpc(name,params);if(error){if(SAFE_ERRORS.slice(0,4).includes(error.message))throw Error(error.message);throw Error();}return data;}
 catch(error){if(error instanceof Error&&SAFE_ERRORS.slice(0,4).includes(error.message))throw error;throw Error("GOOGLE_LEGACY_STORAGE_UNAVAILABLE");}
}
export async function loadGoogleLegacyStatus(scope:GoogleWorkspace):Promise<GoogleLegacyStatus>{
 try{
  const row=record(await rpc("zelo_google_legacy_status",args(target(scope))));
  if(typeof row.exists!=="boolean"||typeof row.assigned!=="boolean"||typeof row.assignedHere!=="boolean"||row.assignedHere&&!row.assigned)throw Error("GOOGLE_LEGACY_STORAGE_INVALID");
  return Object.freeze({exists:row.exists,assigned:row.assigned,assignedHere:row.assignedHere});
 }catch(error){throw safe(error);}
}
function decodedLegacy(value:unknown):{token:string;calendarId:string}{
 const decrypted=decryptField(googleCredentialCiphertext(value));if(typeof decrypted!=="string")throw Error();
 let parsed:unknown;try{parsed=JSON.parse(decrypted);}catch{if(/^[{\["]/u.test(decrypted))throw Error();return {token:googleCredentialValue(decrypted),calendarId:"primary"};}
 const row=record(parsed);
 return {token:googleCredentialValue(row.token),calendarId:row.selectedCalendarId===undefined?"primary":text(row.selectedCalendarId,1024)};
}

/** Only an explicit authenticated, CSRF-protected selection may call this server
 * adapter. No production route is installed yet; the old row remains untouched.
 * Legacy assignment creates no ownership claim over historical Calendar events. */
export async function assignLegacyGoogleConnection(scope:GoogleWorkspace,expectedBindingVersion:string):Promise<GoogleBinding>{
 let client:Awaited<ReturnType<typeof getAuthClient>>|undefined;
 try{
  const selected=target(scope);let expected:string;
  try{expected=googleOAuthBindingVersion(expectedBindingVersion);}catch{throw Error("GOOGLE_LEGACY_CONFLICT");}
  client=await getAuthClient();if(typeof client._clientId!=="string")throw Error();
  const clientId=client._clientId,fingerprint=googleOAuthClientFingerprint(clientId);
  const raw=await rpc("zelo_google_legacy_snapshot",args(selected));if(raw===null)throw Error("GOOGLE_LEGACY_MISSING");
  let access:string,refresh:string,calendarId:string,expiry:number,sourceFingerprint:string,original:GoogleBinding|null;
  try{
   const row=record(raw);if(row.user_id!==selected.userId||typeof row.source_fingerprint!=="string"||!/^[a-f0-9]{64}$/.test(row.source_fingerprint))throw Error();
   sourceFingerprint=row.source_fingerprint;
   if(typeof row.expires_at!=="string"||!Number.isFinite(Date.parse(row.expires_at)))throw Error();expiry=Date.parse(row.expires_at);
   original=row.binding===null?null:googleBindingFromStorage(row.binding,selected);if(original?.unlinkedAt===null)throw Error();
   if((original?.version??"0")!==expected)throw Error("GOOGLE_LEGACY_CONFLICT");
   ({token:access,calendarId}=decodedLegacy(row.access_ciphertext));refresh=googleCredentialValue(decryptField(googleCredentialCiphertext(row.refresh_ciphertext)));
  }catch(error){if(error instanceof Error&&error.message==="GOOGLE_LEGACY_CONFLICT")throw error;throw Error("GOOGLE_LEGACY_STORAGE_INVALID");}
  if(expiry<=Date.now())throw Error("GOOGLE_LEGACY_REAUTHORIZE_REQUIRED");
  const snapshot=await captureGoogleGrantVersions(selected,clientId);
  let subject:string;
  try{
   const info=record(await client.getTokenInfo(access));subject=text(info.sub,255);
   if(/\s/.test(subject)||info.aud!==clientId||info.azp!==undefined&&info.azp!==clientId||typeof info.expiry_date!=="number"||!Number.isSafeInteger(info.expiry_date)||info.expiry_date<=Date.now())throw Error();
   if(!Array.isArray(info.scopes)||!info.scopes.every(v=>typeof v==="string"))throw Error();
   const scopes=new Set(info.scopes);
   if(!scopes.has("https://www.googleapis.com/auth/calendar")&&!(scopes.has("https://www.googleapis.com/auth/calendar.events")&&scopes.has("https://www.googleapis.com/auth/calendar.calendarlist.readonly")))throw Error();
   expiry=Math.min(expiry,info.expiry_date);if(expiry<=Date.now())throw Error();
  }catch{throw Error("GOOGLE_LEGACY_REAUTHORIZE_REQUIRED");}
  client.setCredentials({access_token:access,expiry_date:expiry});client.refreshHandler=undefined;client.eagerRefreshThresholdMillis=0;client.forceRefreshOnFailure=false;
  let calendarName:string|null;
  try{
   const {data}=await google.calendar({version:"v3",auth:client}).calendarList.get({calendarId},{retry:false});
   const cal=record(data),verifiedId=text(cal.id,1024);
   if(cal.deleted===true||(cal.accessRole!=="owner"&&cal.accessRole!=="writer"))throw Error();
   if(calendarId==="primary"?cal.primary!==true:verifiedId!==calendarId)throw Error();
   calendarId=verifiedId;calendarName=cal.summary==null?null:text(cal.summary,512);
  }catch{throw Error("GOOGLE_LEGACY_REAUTHORIZE_REQUIRED");}
  const grantVersion=googleCapturedGrantVersion(snapshot,selected,fingerprint,subject);if(expiry<=Date.now())throw Error("GOOGLE_LEGACY_REAUTHORIZE_REQUIRED");
  const encryptedAccess=encryptField(access),encryptedRefresh=encryptField(refresh);if(!encryptedAccess||!encryptedRefresh)throw Error();
  const result=await rpc("zelo_google_legacy_assign",{...args(selected),p_source_fingerprint:sourceFingerprint,p_subject:subject,p_client_fingerprint:fingerprint,p_binding_version:original?.version??"0",p_grant_version:grantVersion,p_access_ciphertext:encryptedAccess,p_refresh_ciphertext:encryptedRefresh,p_expires_at:new Date(expiry).toISOString(),p_calendar_id:calendarId,p_calendar_name:calendarName});
  let saved:GoogleBinding;
  try{saved=googleBindingFromStorage(result,selected);if(saved.unlinkedAt!==null||saved.calendarId!==calendarId||saved.calendarName!==calendarName||BigInt(saved.version)!==BigInt(original?.version??"0")+BigInt(1)||original&&saved.id!==original.id)throw Error();}
  catch{throw Error("GOOGLE_LEGACY_STORAGE_INVALID");}
  return saved;
 }catch(error){throw safe(error);}finally{client?.setCredentials({});}
}
