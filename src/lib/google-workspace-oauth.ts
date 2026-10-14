import "server-only";
import {getAuthClient,GOOGLE_OAUTH_SCOPES} from "./google-oauth";
import {googleWorkspaceKey,type GoogleWorkspace} from "./google-workspace-policy";
import {issueGoogleOAuthState,consumeGoogleOAuthState,googleOAuthClientFingerprint,googleOAuthBindingVersion,type GooglePendingState} from "./google-oauth-state";
import {verifyGoogleIdentity} from "./google-verified-identity";
import {loadGoogleBinding,captureGoogleGrantVersions,saveVerifiedGoogleBinding,type GoogleBinding,type GoogleBindingTokens} from "./google-binding-store";

type AuthorizationResult=Readonly<{workspace:GoogleWorkspace;locale:GooglePendingState["locale"];cancelled:boolean;binding:GoogleBinding|null}>;
function credential(value:unknown):string {
  if(typeof value!=="string"||!value||value.length>16384||/[\s\p{Cc}]/u.test(value))throw Error();
  return value;
}
function tokens(value:unknown):{idToken:string;credentials:GoogleBindingTokens} {
  if(!value||typeof value!=="object"||Array.isArray(value))throw Error();
  const row=value as Record<string,unknown>;
  const accessToken=credential(row.access_token),idToken=credential(row.id_token);
  const refreshToken=row.refresh_token==null?null:credential(row.refresh_token);
  if(typeof row.expiry_date!=="number"||!Number.isSafeInteger(row.expiry_date)||row.expiry_date<=Date.now())throw Error();
  const expiresAt=new Date(row.expiry_date).toISOString();
  return {idToken,credentials:Object.freeze({accessToken,refreshToken,expiresAt})};
}

/** Called only with an authenticated workspace/session. Never consult UI mode
 * again after capturing the target of this authorization. */
export async function startGoogleWorkspaceAuthorization(scope:GoogleWorkspace,sessionId:string,locale:GooglePendingState["locale"],expectedBindingVersion:string):Promise<string> {
  try {
    googleWorkspaceKey(scope);
    const selected=Object.freeze({userId:scope.userId.toLowerCase(),mode:scope.mode,companyId:scope.companyId?.toLowerCase()??null});
    const revision=googleOAuthBindingVersion(expectedBindingVersion);
    if(typeof sessionId!=="string"||!sessionId||sessionId.length>16384||!["pt-BR","pt-PT","es"].includes(locale))throw Error();
    const client=await getAuthClient(),clientId=client._clientId;
    if(typeof clientId!=="string")throw Error();
    googleOAuthClientFingerprint(clientId);
    const pending=await issueGoogleOAuthState(selected,sessionId,clientId,locale,revision);
    return client.generateAuthUrl({access_type:"offline",prompt:"consent",scope:[...GOOGLE_OAUTH_SCOPES],state:pending.state,nonce:pending.nonce});
  }catch(error){
    if(error instanceof Error&&error.message==="GOOGLE_STATE_CONFLICT")throw Error("GOOGLE_STATE_CONFLICT");
    throw Error("GOOGLE_AUTHORIZATION_INVALID");
  }
}

/** The HTTP boundary supplies the authenticated owner and session, never a
 * workspace claimed by the callback or the current page. No legacy fallback. */
export async function finishGoogleWorkspaceAuthorization(ownerId:string,sessionId:string,state:string|null,code:string|null):Promise<AuthorizationResult> {
  try {
    const client=await getAuthClient(),clientId=client._clientId;
    if(typeof clientId!=="string")throw Error();
    googleOAuthClientFingerprint(clientId);
    const pending=await consumeGoogleOAuthState(ownerId,state,sessionId,clientId);
    if(!pending)throw Error();
    if(code===null)return Object.freeze({workspace:pending.workspace,locale:pending.locale,cancelled:true,binding:null});
    const authorizationCode=credential(code);
    const current=await loadGoogleBinding(pending.workspace);
    if((current?.version??"0")!==pending.bindingVersion)throw Error();
    const snapshot=await captureGoogleGrantVersions(pending.workspace,clientId);
    const response=await client.getToken(authorizationCode);
    const received=tokens(response.tokens);
    const proof=await verifyGoogleIdentity(received.idToken,clientId,pending);
    const binding=await saveVerifiedGoogleBinding(proof,clientId,received.credentials,snapshot);
    return Object.freeze({workspace:pending.workspace,locale:pending.locale,cancelled:false,binding});
  }catch{throw Error("GOOGLE_AUTHORIZATION_INVALID");}
}
