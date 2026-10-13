import "server-only";
import {encryptField,decryptField} from "./crypto-store";
import {getSupabase} from "./supabase";
import {googleOAuthBindingVersion,googleOAuthClientFingerprint} from "./google-oauth-state";
import {assertVerifiedGoogleIdentity,type VerifiedGoogleIdentity} from "./google-verified-identity";
import {assertGoogleWorkspaceMatch,googleWorkspaceKey,type GoogleWorkspace} from "./google-workspace-policy";

export type GoogleBinding=Readonly<{id:string;workspace:GoogleWorkspace;grantId:string;calendarId:string;calendarName:string|null;version:string;unlinkedAt:string|null}>;
export type GoogleBindingTokens=Readonly<{accessToken:string;refreshToken?:string|null;expiresAt:string}>;
export type GoogleGrantVersionSnapshot=Readonly<{workspace:GoogleWorkspace;clientFingerprint:string}>;
const snapshots=new WeakMap<GoogleGrantVersionSnapshot,{versions:Map<string,string>;expiresAt:number}>();
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function record(value:unknown):Record<string,unknown>{
 if(!value||typeof value!=="object"||Array.isArray(value))throw Error();
 return value as Record<string,unknown>;
}
function id(value:unknown):string{if(typeof value!=="string"||!UUID.test(value))throw Error();return value.toLowerCase();}
function text(value:unknown,max:number):string{if(typeof value!=="string"||!value.trim()||value.length>max||/\p{Cc}/u.test(value))throw Error();return value;}
function version(value:unknown):string{
 const decimal=typeof value==="number"&&Number.isSafeInteger(value)?String(value):value;
 const result=googleOAuthBindingVersion(decimal);if(result==="0")throw Error();return result;
}
function timestamp(value:unknown):string{if(typeof value!=="string"||!Number.isFinite(Date.parse(value)))throw Error();return value;}
function scopeParams(scope:GoogleWorkspace){
 googleWorkspaceKey(scope);
 return {p_user_id:scope.userId.toLowerCase(),p_mode:scope.mode,p_company_id:scope.companyId?.toLowerCase()??null};
}
function snapshotScope(scope:GoogleWorkspace):GoogleWorkspace{
 googleWorkspaceKey(scope);
 return Object.freeze({userId:scope.userId.toLowerCase(),mode:scope.mode,companyId:scope.companyId?.toLowerCase()??null});
}
async function rpc(name:string,params:Record<string,unknown>):Promise<unknown>{
 try{
  const {data,error}=await getSupabase().rpc(name,params);
  if(error){if(error.message==="GOOGLE_BINDING_CONFLICT")throw Error("GOOGLE_BINDING_CONFLICT");throw Error();}
  return data;
 }catch(error){
  if(error instanceof Error&&error.message==="GOOGLE_BINDING_CONFLICT")throw Error("GOOGLE_BINDING_CONFLICT");
  throw Error("GOOGLE_BINDING_STORAGE_UNAVAILABLE");
 }
}
export function googleBindingFromStorage(value:unknown,expected:GoogleWorkspace):GoogleBinding{
 try{
  const row=record(value);
  if(row.mode!=="personal"&&row.mode!=="business")throw Error();
  const workspace=Object.freeze({userId:id(row.user_id),mode:row.mode,companyId:row.company_id===null?null:id(row.company_id)});
  assertGoogleWorkspaceMatch(expected,workspace);
  if(row.calendar_name!==null&&(typeof row.calendar_name!=="string"||row.calendar_name.length>512||/\p{Cc}/u.test(row.calendar_name)))throw Error();
  return Object.freeze({id:id(row.id),workspace,grantId:id(row.grant_id),calendarId:text(row.calendar_id,1024),calendarName:row.calendar_name,version:version(row.version),unlinkedAt:row.unlinked_at===null?null:timestamp(row.unlinked_at)});
 }catch{throw Error("GOOGLE_BINDING_STORAGE_INVALID");}
}
/** Scope must already come from authenticated request/participant/state context. */
export async function loadGoogleBinding(scope:GoogleWorkspace):Promise<GoogleBinding|null>{
 const selected=snapshotScope(scope);
 const result=await rpc("zelo_google_binding_get",scopeParams(selected));
 return result===null?null:googleBindingFromStorage(result,selected);
}
/** Capture revisions before exchanging the OAuth code, while the returned
 * Google subject is still unknown. No credential bytes leave private storage. */
export async function captureGoogleGrantVersions(scope:GoogleWorkspace,clientId:string):Promise<GoogleGrantVersionSnapshot>{
 const workspace=snapshotScope(scope),clientFingerprint=googleOAuthClientFingerprint(clientId),expiresAt=Date.now()+600_000;
 const data=await rpc("zelo_google_grant_versions",{...scopeParams(workspace),p_client_fingerprint:clientFingerprint});
 try{
  if(!Array.isArray(data)||data.length>10000||Date.now()>=expiresAt)throw Error();
  const versions=new Map<string,string>();
  for(const value of data){
   const row=record(value),subject=text(row.subject,255);
   if(/\s/.test(subject)||versions.has(subject))throw Error();
   versions.set(subject,version(row.version));
  }
  const snapshot=Object.freeze({workspace,clientFingerprint});
  snapshots.set(snapshot,{versions,expiresAt});
  return snapshot;
 }catch{throw Error("GOOGLE_BINDING_STORAGE_INVALID");}
}
function snapshotVersion(snapshot:GoogleGrantVersionSnapshot,proof:VerifiedGoogleIdentity):string{
 const captured=snapshots.get(snapshot);
 if(!captured||Date.now()>=captured.expiresAt)throw Error("GOOGLE_BINDING_SNAPSHOT_INVALID");
 assertGoogleWorkspaceMatch(proof.workspace,snapshot.workspace);
 if(snapshot.clientFingerprint!==proof.clientFingerprint)throw Error("GOOGLE_BINDING_SNAPSHOT_INVALID");
 return captured.versions.get(proof.subject)??"0";
}
export function googleCredentialValue(value:unknown):string{
 if(typeof value!=="string"||!value||value.length>16384||/[\s\p{Cc}]/u.test(value))throw Error("GOOGLE_BINDING_CREDENTIAL_INVALID");return value;
}
export function googleCredentialCiphertext(value:unknown):string{
 if(typeof value!=="string"||value.length>32768||! /^enc:[A-Za-z0-9+/]+={0,2}$/.test(value))throw Error();
 const encoded=value.slice(4),bytes=Buffer.from(encoded,"base64");
 if(bytes.length<29||bytes.toString("base64")!==encoded)throw Error();return value;
}
/** Only tokens from the trusted code-exchange transport may reach this adapter.
 * The previous refresh is looked up internally from the exact verified identity. */
export async function saveVerifiedGoogleBinding(proof:VerifiedGoogleIdentity,clientId:string,tokens:GoogleBindingTokens,snapshot:GoogleGrantVersionSnapshot):Promise<GoogleBinding>{
 assertVerifiedGoogleIdentity(proof,proof?.workspace,clientId);
 const grantVersion=snapshotVersion(snapshot,proof);
 const input=record(tokens),access=googleCredentialValue(input.accessToken);
 const refresh=input.refreshToken==null?null:googleCredentialValue(input.refreshToken);
 let expiresAt:string;
 try{expiresAt=timestamp(input.expiresAt);if(Date.parse(expiresAt)<=Date.now())throw Error();}
 catch{throw Error("GOOGLE_BINDING_CREDENTIAL_INVALID");}
 const data=await rpc("zelo_google_grant_for_identity",{...scopeParams(proof.workspace),p_subject:proof.subject,p_client_fingerprint:proof.clientFingerprint});
 let previousRefresh:string|null=null;
 if(data!==null){
  try{
   const row=record(data);
   if(id(row.user_id)!==proof.workspace.userId||row.subject!==proof.subject||row.client_fingerprint!==proof.clientFingerprint)throw Error();
   id(row.id);timestamp(row.expires_at);googleCredentialCiphertext(row.access_ciphertext);
   const encryptedRefresh=googleCredentialCiphertext(row.refresh_ciphertext);
   if(version(row.version)!==grantVersion)throw Error("GOOGLE_BINDING_CONFLICT");
   if(refresh===null)previousRefresh=googleCredentialValue(decryptField(encryptedRefresh));
  }catch(error){
   if(error instanceof Error&&error.message==="GOOGLE_BINDING_CONFLICT")throw Error("GOOGLE_BINDING_CONFLICT");
   throw Error("GOOGLE_BINDING_STORAGE_INVALID");
  }
 }
 if(data===null&&grantVersion!=="0")throw Error("GOOGLE_BINDING_CONFLICT");
 const selectedRefresh=refresh??previousRefresh;
 if(selectedRefresh===null)throw Error("GOOGLE_REAUTHORIZE_REQUIRED");
 assertVerifiedGoogleIdentity(proof,proof.workspace,clientId);
 snapshotVersion(snapshot,proof);
 let encryptedAccess:string|undefined,encryptedRefresh:string|undefined;
 try{encryptedAccess=encryptField(access);encryptedRefresh=encryptField(selectedRefresh);if(!encryptedAccess||!encryptedRefresh)throw Error();}
 catch{throw Error("GOOGLE_BINDING_STORAGE_UNAVAILABLE");}
 const result=await rpc("zelo_google_binding_save",{...scopeParams(proof.workspace),p_subject:proof.subject,p_client_fingerprint:proof.clientFingerprint,p_binding_version:proof.bindingVersion,p_grant_version:grantVersion,p_access_ciphertext:encryptedAccess,p_refresh_ciphertext:encryptedRefresh,p_expires_at:expiresAt});
 const saved=googleBindingFromStorage(result,proof.workspace);
 if(saved.unlinkedAt!==null||BigInt(saved.version)!==BigInt(proof.bindingVersion)+BigInt(1))throw Error("GOOGLE_BINDING_STORAGE_INVALID");
 return saved;
}
