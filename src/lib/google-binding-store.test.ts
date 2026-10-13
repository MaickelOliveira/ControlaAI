import {createHash,createSign,generateKeyPairSync} from "node:crypto";
import {google} from "googleapis";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import type {GoogleWorkspace} from "./google-workspace-policy";
import type {GooglePendingState} from "./google-oauth-state";
const storage=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("./supabase",()=>({getSupabase:()=>storage}));
import {encryptField,decryptField} from "./crypto-store";
import {googleOAuthClientFingerprint} from "./google-oauth-state";
import {verifyGoogleIdentity,type VerifiedGoogleIdentity} from "./google-verified-identity";
import {loadGoogleBinding,captureGoogleGrantVersions,saveVerifiedGoogleBinding as saveBinding,type GoogleBindingTokens,type GoogleGrantVersionSnapshot} from "./google-binding-store";
let snapshot:GoogleGrantVersionSnapshot;
function saveVerifiedGoogleBinding(identity:VerifiedGoogleIdentity,clientId:string,tokens:GoogleBindingTokens){return saveBinding(identity,clientId,tokens,snapshot);}
const owner="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",company="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
const bindingId="cccccccc-cccc-4ccc-8ccc-ccccccccccc1",grantId="dddddddd-dddd-4ddd-8ddd-ddddddddddd1";
const scope:GoogleWorkspace={userId:owner,mode:"business",companyId:company};
const client="fixture.apps.googleusercontent.com",subject="fictitious-subject",nonce="n".repeat(43);
const now=Date.parse("2026-10-13T12:00:00Z"),expiry=new Date(now+3600_000).toISOString();
const keys=generateKeyPairSync("rsa",{modulusLength:2048});
const certs={fixture:keys.publicKey.export({type:"spki",format:"pem"}).toString()};
function binding(patch:Record<string,unknown>={}){return {id:bindingId,user_id:owner,mode:"business",company_id:company,grant_id:grantId,calendar_id:"fixture-calendar",calendar_name:"Fixture calendar",version:3,unlinked_at:null,...patch};}
function grant(patch:Record<string,unknown>={}){return {id:grantId,user_id:owner,subject,client_fingerprint:googleOAuthClientFingerprint(client),access_ciphertext:encryptField("fictitious-old-access"),refresh_ciphertext:encryptField("fictitious-old-refresh"),expires_at:new Date(now-1000).toISOString(),version:2,...patch};}
async function proof(){
 const head=Buffer.from(JSON.stringify({alg:"RS256",kid:"fixture"})).toString("base64url");
 const body=Buffer.from(JSON.stringify({iss:"https://accounts.google.com",aud:client,sub:subject,nonce,iat:now/1000,exp:now/1000+3600})).toString("base64url");
 const signed=head+"."+body;
 const idToken=signed+"."+createSign("RSA-SHA256").update(signed).sign(keys.privateKey,"base64url");
 const pending:GooglePendingState={workspace:scope,locale:"pt-BR",nonceHash:createHash("sha256").update("google-oauth-nonce\0"+nonce).digest("hex"),expiresAt:new Date(now+600_000).toISOString(),bindingVersion:"3"};
 return verifyGoogleIdentity(idToken,client,pending);
}
beforeEach(async()=>{
 vi.useFakeTimers();vi.setSystemTime(now);vi.stubEnv("DATA_ENCRYPTION_KEY","fictitious-test-encryption-key-only");
 type CertResponse=Awaited<ReturnType<typeof google.auth.OAuth2.prototype.getFederatedSignonCertsAsync>>;
 vi.spyOn(google.auth.OAuth2.prototype,"getFederatedSignonCertsAsync").mockResolvedValue({certs,format:"PEM" as CertResponse["format"]});
 storage.rpc.mockReset().mockImplementation(async name=>({data:name==="zelo_google_grant_versions"?[{subject,version:"2"}]:name==="zelo_google_grant_for_identity"?grant():binding({version:4}),error:null}));
 snapshot=await captureGoogleGrantVersions(scope,client);storage.rpc.mockClear();
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();vi.useRealTimers();});
it("returns only immutable scoped metadata even if storage includes a credential field",async()=>{
 storage.rpc.mockResolvedValue({data:binding({access_ciphertext:"fictitious-private-value"}),error:null});
 const result=await loadGoogleBinding(scope);
 expect(result).toEqual({id:bindingId,workspace:scope,grantId,calendarId:"fixture-calendar",calendarName:"Fixture calendar",version:"3",unlinkedAt:null});
 expect(Object.isFrozen(result)).toBe(true);expect(Object.isFrozen(result?.workspace)).toBe(true);
 expect(JSON.stringify(result)).not.toContain("fictitious-private-value");
 expect(storage.rpc.mock.calls[0][1]).toEqual({p_user_id:owner,p_mode:"business",p_company_id:company});
});
it("keeps absent bindings absent and never queries legacy credentials",async()=>{
 storage.rpc.mockResolvedValue({data:null,error:null});
 expect(await loadGoogleBinding({userId:owner,mode:"personal",companyId:null})).toBeNull();
 expect(storage.rpc).toHaveBeenCalledTimes(1);
});
it.each([{user_id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2"},{company_id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2"},{mode:"personal"},{version:0},{version:9007199254740992},{id:"bad"},{grant_id:"bad"},{calendar_id:""},{calendar_name:12},{unlinked_at:"invalid"}])("rejects corrupted or foreign metadata %#",async patch=>{
 storage.rpc.mockResolvedValue({data:binding(patch),error:null});
 await expect(loadGoogleBinding(scope)).rejects.toThrow("GOOGLE_BINDING_STORAGE_INVALID");
});
it("encrypts new credentials and saves the original binding revision plus exact grant revision",async()=>{
 const identity=await proof();
 const result=await saveVerifiedGoogleBinding(identity,client,{accessToken:"fictitious-new-access",refreshToken:"fictitious-new-refresh",expiresAt:expiry});
 const [name,args]=storage.rpc.mock.calls[1];
 expect(name).toBe("zelo_google_binding_save");
 expect(args).toMatchObject({p_user_id:owner,p_mode:"business",p_company_id:company,p_subject:subject,p_client_fingerprint:googleOAuthClientFingerprint(client),p_binding_version:"3",p_grant_version:"2",p_expires_at:expiry});
 expect(args.p_access_ciphertext).toMatch(/^enc:/);expect(args.p_refresh_ciphertext).toMatch(/^enc:/);
 expect(decryptField(args.p_access_ciphertext)).toBe("fictitious-new-access");expect(decryptField(args.p_refresh_ciphertext)).toBe("fictitious-new-refresh");
 expect(JSON.stringify(args)).not.toContain("fictitious-new-access");expect(JSON.stringify(result)).not.toContain("fictitious-new-refresh");
});
it("reuses a refresh token only from the same verified owner, subject and client",async()=>{
 await saveVerifiedGoogleBinding(await proof(),client,{accessToken:"fictitious-new-access",expiresAt:expiry});
 expect(decryptField(storage.rpc.mock.calls[1][1].p_refresh_ciphertext)).toBe("fictitious-old-refresh");
});
it.each([{user_id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2"},{subject:"other-subject"},{client_fingerprint:"0".repeat(64)},{version:0},{refresh_ciphertext:"fictitious-plaintext"},{refresh_ciphertext:"enc:"+"QUFB".repeat(12)}])("rejects a mismatched or undecryptable refresh without saving %#",async patch=>{
 storage.rpc.mockResolvedValue({data:grant(patch),error:null});
 await expect(saveVerifiedGoogleBinding(await proof(),client,{accessToken:"fictitious-new-access",expiresAt:expiry})).rejects.toThrow();
 expect(storage.rpc).toHaveBeenCalledTimes(1);
});
it("requires a new refresh token for a new identity without a saved grant",async()=>{
 storage.rpc.mockResolvedValue({data:[],error:null});snapshot=await captureGoogleGrantVersions(scope,client);storage.rpc.mockClear();
 storage.rpc.mockResolvedValue({data:null,error:null});
 await expect(saveVerifiedGoogleBinding(await proof(),client,{accessToken:"fictitious-new-access",expiresAt:expiry})).rejects.toThrow("GOOGLE_REAUTHORIZE_REQUIRED");
 expect(storage.rpc).toHaveBeenCalledTimes(1);
});
it.each([{accessToken:""},{accessToken:null},{refreshToken:""},{expiresAt:new Date(now).toISOString()},{expiresAt:"invalid"}])("rejects unusable provider credentials before storage %#",async patch=>{
 await expect(saveVerifiedGoogleBinding(await proof(),client,{accessToken:"fictitious-new-access",refreshToken:"fictitious-new-refresh",expiresAt:expiry,...patch} as never)).rejects.toThrow();
 expect(storage.rpc).not.toHaveBeenCalled();
});
it("rejects copied identity proofs and another configured client before storage",async()=>{
 const identity=await proof();
 await expect(saveVerifiedGoogleBinding({...identity} as VerifiedGoogleIdentity,client,{accessToken:"fixture",refreshToken:"fixture",expiresAt:expiry})).rejects.toThrow();
 await expect(saveVerifiedGoogleBinding(identity,"other-client",{accessToken:"fixture",refreshToken:"fixture",expiresAt:expiry})).rejects.toThrow();
 expect(storage.rpc).not.toHaveBeenCalled();
});
it("hides database diagnostics and rejects failed CAS instead of returning old metadata as success",async()=>{
 storage.rpc.mockResolvedValue({data:binding(),error:{message:"fictitious private database detail"}});
 const error=await loadGoogleBinding(scope).catch(e=>e);
 expect(error.message).toBe("GOOGLE_BINDING_STORAGE_UNAVAILABLE");expect(error).not.toHaveProperty("cause");
 expect(error.stack).not.toContain("private database");
 storage.rpc.mockImplementation(async name=>({data:name==="zelo_google_grant_for_identity"?grant():null,error:name==="zelo_google_binding_save"?{message:"GOOGLE_BINDING_CONFLICT"}:null}));
 await expect(saveVerifiedGoogleBinding(await proof(),client,{accessToken:"fixture-new",refreshToken:"fixture-new",expiresAt:expiry})).rejects.toThrow("GOOGLE_BINDING_CONFLICT");
});
it.each([null,{},[{subject,version:"0"}],[{subject,version:"9007199254740992"},{subject,version:"2"}],[{subject:"bad subject",version:"2"}],[{subject,version:9007199254740992}]])("rejects unusable revision snapshots %#",async data=>{
 storage.rpc.mockResolvedValue({data,error:null});
 await expect(captureGoogleGrantVersions(scope,client)).rejects.toThrow("GOOGLE_BINDING_STORAGE_INVALID");
});
it("rejects copied, foreign-workspace, foreign-client and expired snapshots",async()=>{
 const identity=await proof(),input={accessToken:"fixture-new",refreshToken:"fixture-new",expiresAt:expiry};
 await expect(saveBinding(identity,client,input,{...snapshot})).rejects.toThrow("GOOGLE_BINDING_SNAPSHOT_INVALID");
 const foreign=await captureGoogleGrantVersions({...scope,companyId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2"},client);
 const otherClient=await captureGoogleGrantVersions(scope,"other-fixture-client");storage.rpc.mockClear();
 await expect(saveBinding(identity,client,input,foreign)).rejects.toThrow();
 await expect(saveBinding(identity,client,input,otherClient)).rejects.toThrow();
 expect(storage.rpc).not.toHaveBeenCalled();
 vi.setSystemTime(now+600_000);
 await expect(saveBinding(identity,client,input,snapshot)).rejects.toThrow();expect(storage.rpc).not.toHaveBeenCalled();
});
it("keeps the captured workspace when caller memory changes during a metadata read",async()=>{
 const mutable={...scope};let resolve:(value:unknown)=>void=()=>{};
 storage.rpc.mockImplementation(()=>new Promise(r=>{resolve=r;}));
 const reading=loadGoogleBinding(mutable);mutable.companyId="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";
 resolve({data:binding(),error:null});expect((await reading)?.workspace).toEqual(scope);
});
it("captures token strings before the identity lookup and rejects an expired proof afterward",async()=>{
 const identity=await proof(),input={accessToken:"fixture-original",refreshToken:"fixture-original-refresh",expiresAt:expiry};
 storage.rpc.mockImplementation(async name=>{
  if(name==="zelo_google_grant_for_identity"){input.accessToken="fixture-mutated";return {data:grant(),error:null};}
  return {data:binding({version:4}),error:null};
 });
 await saveBinding(identity,client,input,snapshot);
 expect(decryptField(storage.rpc.mock.calls[1][1].p_access_ciphertext)).toBe("fixture-original");
 storage.rpc.mockClear();storage.rpc.mockImplementation(async()=>{vi.setSystemTime(now+600_000);return {data:grant(),error:null};});
 await expect(saveBinding(identity,client,input,snapshot)).rejects.toThrow();expect(storage.rpc).toHaveBeenCalledTimes(1);
});
it.each([{unlinked_at:new Date(now).toISOString()},{version:3},{company_id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2"}])("does not report invalid save metadata as success %#",async patch=>{
 storage.rpc.mockImplementation(async name=>({data:name==="zelo_google_grant_for_identity"?grant():binding({version:4,...patch}),error:null}));
 await expect(saveBinding(await proof(),client,{accessToken:"fixture-new",refreshToken:"fixture-new",expiresAt:expiry},snapshot)).rejects.toThrow("GOOGLE_BINDING_STORAGE_INVALID");
});
it("refuses a write when encryption is unavailable instead of storing plaintext",async()=>{
 const stored=grant();storage.rpc.mockResolvedValue({data:stored,error:null});vi.stubEnv("DATA_ENCRYPTION_KEY",undefined);
 const error=await saveBinding(await proof(),client,{accessToken:"fixture-new",refreshToken:"fixture-new",expiresAt:expiry},snapshot).catch(e=>e);
 expect(error.message).toBe("GOOGLE_BINDING_STORAGE_UNAVAILABLE");expect(error).not.toHaveProperty("cause");expect(storage.rpc).toHaveBeenCalledTimes(1);
});
