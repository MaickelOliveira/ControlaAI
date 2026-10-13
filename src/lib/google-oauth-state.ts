import "server-only";
import {createHash,randomBytes,timingSafeEqual} from "node:crypto";
import {getSupabase} from "./supabase";
import {googleWorkspaceKey,type GoogleWorkspace} from "./google-workspace-policy";

type Locale="pt-BR"|"pt-PT"|"es";
export type GooglePendingState=Readonly<{workspace:GoogleWorkspace;locale:Locale;nonceHash:string;expiresAt:string}>;
const OPAQUE=/^[A-Za-z0-9_-]{43}$/;
const HASH=/^[a-f0-9]{64}$/;
function hash(kind:string,value:string):string {
  return createHash("sha256").update(`google-oauth-${kind}\0${value}`).digest("hex");
}
function locale(value:unknown):Locale {
  if(value!=="pt-BR"&&value!=="pt-PT"&&value!=="es")throw Error("GOOGLE_STATE_INVALID");
  return value;
}
export function googleOAuthClientFingerprint(clientId:string):string {
  if(typeof clientId!=="string"||!clientId||clientId.length>1024||/\s/.test(clientId))throw Error("GOOGLE_STATE_INVALID");
  return hash("client",clientId);
}
function identity(sessionId:string,clientId:string):{sessionHash:string;clientFingerprint:string} {
  if(typeof sessionId!=="string"||!sessionId||sessionId.length>16384)throw Error("GOOGLE_STATE_INVALID");
  return {sessionHash:hash("session",sessionId),clientFingerprint:googleOAuthClientFingerprint(clientId)};
}
function workspace(value:GoogleWorkspace):GoogleWorkspace {
  googleWorkspaceKey(value); // Validate the whole tuple before accessing fields.
  return Object.freeze({userId:value.userId.toLowerCase(),mode:value.mode,companyId:value.companyId?.toLowerCase()??null});
}
async function rpc(name:string,args:Record<string,string|null>):Promise<unknown> {
  try {
    const {data,error}=await getSupabase().rpc(name,args);
    if(error)throw Error("GOOGLE_STATE_STORAGE_UNAVAILABLE");
    return data;
  }catch{throw Error("GOOGLE_STATE_STORAGE_UNAVAILABLE");}
}

/** Call only after authenticated workspace resolution. The database rechecks
 * company ownership/activity; no current-mode fallback is accepted. */
export async function issueGoogleOAuthState(scope:GoogleWorkspace,sessionId:string,clientId:string,selectedLocale:Locale):Promise<{state:string;nonce:string}> {
  const selected=workspace(scope),language=locale(selectedLocale),verified=identity(sessionId,clientId);
  const state=randomBytes(32).toString("base64url"),nonce=randomBytes(32).toString("base64url");
  await rpc("zelo_google_state_issue",{
    p_user_id:selected.userId,p_mode:selected.mode,p_company_id:selected.companyId,
    p_state_hash:hash("state",state),p_session_hash:verified.sessionHash,p_client_fingerprint:verified.clientFingerprint,
    p_nonce_hash:hash("nonce",nonce),p_locale:language,
  });
  return {state,nonce};
}

/** Atomic single-use consumption is shared between app processes. The tuple
 * returned by storage is the original target, independent of current UI mode. */
export async function consumeGoogleOAuthState(ownerId:string,state:string|null,sessionId:string,clientId:string):Promise<GooglePendingState|null> {
  if(typeof state!=="string"||!OPAQUE.test(state))return null;
  const owner=workspace({userId:ownerId,mode:"personal",companyId:null}).userId;
  const verified=identity(sessionId,clientId);
  const data=await rpc("zelo_google_state_consume",{
    p_user_id:owner,p_state_hash:hash("state",state),p_session_hash:verified.sessionHash,p_client_fingerprint:verified.clientFingerprint,
  });
  if(data===null)return null;
  try {
    if(!data||typeof data!=="object"||Array.isArray(data))throw Error();
    const row=data as Record<string,unknown>;
    if(typeof row.user_id!=="string"||(row.mode!=="personal"&&row.mode!=="business")||(row.company_id!==null&&typeof row.company_id!=="string"))throw Error();
    const selected=workspace({userId:row.user_id,mode:row.mode,companyId:row.company_id});
    if(selected.userId!==owner||typeof row.nonce_hash!=="string"||!HASH.test(row.nonce_hash)||typeof row.expires_at!=="string"||!Number.isFinite(Date.parse(row.expires_at))||Date.parse(row.expires_at)<=Date.now())throw Error();
    return Object.freeze({workspace:selected,locale:locale(row.locale),nonceHash:row.nonce_hash,expiresAt:row.expires_at});
  }catch{throw Error("GOOGLE_STATE_INVALID");}
}

export function googleOAuthNonceMatches(nonceHash:string,nonce:string):boolean {
  if(typeof nonceHash!=="string"||!HASH.test(nonceHash)||typeof nonce!=="string"||!OPAQUE.test(nonce))return false;
  return timingSafeEqual(Buffer.from(nonceHash,"hex"),Buffer.from(hash("nonce",nonce),"hex"));
}
