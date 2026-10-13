import "server-only";
import {google} from "googleapis";
import {googleOAuthClientFingerprint,googleOAuthNonceMatches,type GooglePendingState} from "./google-oauth-state";
import {assertGoogleWorkspaceMatch,googleWorkspaceKey,type GoogleWorkspace} from "./google-workspace-policy";

declare const verifiedIdentity:unique symbol;
export type VerifiedGoogleIdentity=Readonly<{
  workspace:GoogleWorkspace;subject:string;clientFingerprint:string;
  [verifiedIdentity]:true;
}>;
// A deserialized/caller-constructed object is not a verified provider identity.
const proofs=new WeakMap<VerifiedGoogleIdentity,number>();

/** Only call with the captured state consumed by the authenticated callback.
 * No current UI mode, user-supplied subject, email or credential is a fallback. */
export async function verifyGoogleIdentity(idToken:string,clientId:string,pending:GooglePendingState):Promise<VerifiedGoogleIdentity>{
  try {
    const fingerprint=googleOAuthClientFingerprint(clientId);
    if(typeof idToken!=="string"||idToken.length>32768||! /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(idToken))throw Error();
    const header=JSON.parse(Buffer.from(idToken.split(".")[0],"base64url").toString("utf8"));
    if(!header||header.alg!=="RS256"||typeof header.kid!=="string"||! /^[A-Za-z0-9_-]{1,128}$/.test(header.kid)||header.crit!==undefined||header.b64!==undefined)throw Error();
    if(!pending||typeof pending!=="object"||Array.isArray(pending)||typeof pending.expiresAt!=="string"||typeof pending.nonceHash!=="string"||! /^[a-f0-9]{64}$/.test(pending.nonceHash))throw Error();
    googleWorkspaceKey(pending.workspace);
    const workspace=Object.freeze({userId:pending.workspace.userId.toLowerCase(),mode:pending.workspace.mode,companyId:pending.workspace.companyId?.toLowerCase()??null});
    const expiresAt=Date.parse(pending.expiresAt),nonceHash=pending.nonceHash,now=Date.now();
    if(!Number.isFinite(expiresAt)||expiresAt<=now||expiresAt>now+660_000)throw Error();
    const client=new google.auth.OAuth2(clientId);
    const ticket=await client.verifyIdToken({idToken,audience:clientId});
    const payload=ticket.getPayload();
    if(!payload||(payload.iss!=="accounts.google.com"&&payload.iss!=="https://accounts.google.com")||payload.aud!==clientId
      ||(payload.azp!==undefined&&payload.azp!==clientId)||typeof payload.sub!=="string"||! /^[^\s\p{Cc}]{1,255}$/u.test(payload.sub)
      ||!Number.isSafeInteger(payload.iat)||!Number.isSafeInteger(payload.exp)||payload.iat<=0||payload.exp<=Date.now()/1000
      ||payload.iat>Date.now()/1000+60||payload.iat>=payload.exp||payload.iat<(expiresAt-660_000)/1000)throw Error();
    const nonce=(payload as typeof payload & {nonce?:unknown}).nonce;
    if(typeof nonce!=="string"||!googleOAuthNonceMatches(nonceHash,nonce)||expiresAt<=Date.now())throw Error();
    const proof=Object.freeze({workspace,subject:payload.sub,clientFingerprint:fingerprint}) as VerifiedGoogleIdentity;
    proofs.set(proof,Math.min(expiresAt,payload.exp*1000));
    return proof;
  }catch{throw Error("GOOGLE_IDENTITY_INVALID");}
}

export function assertVerifiedGoogleIdentity(proof:VerifiedGoogleIdentity,workspace:GoogleWorkspace,clientId:string):void{
  try {
    const expiry=proofs.get(proof);
    if(expiry===undefined||expiry<=Date.now()||proof.clientFingerprint!==googleOAuthClientFingerprint(clientId))throw Error();
    assertGoogleWorkspaceMatch(workspace,proof.workspace);
  }catch{throw Error("GOOGLE_IDENTITY_INVALID");}
}
