import {createHash,createSign,generateKeyPairSync} from "node:crypto";
import {google} from "googleapis";
import type {Credentials} from "google-auth-library";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import type {GoogleWorkspace} from "./google-workspace-policy";
const mocks=vi.hoisted(()=>({rpc:vi.fn(),authClient:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("./supabase",()=>({getSupabase:()=>mocks}));
vi.mock("./google-oauth",()=>({getAuthClient:mocks.authClient,GOOGLE_OAUTH_SCOPES:["https://www.googleapis.com/auth/calendar.events","https://www.googleapis.com/auth/calendar.calendarlist.readonly","openid","email"]}));
import {startGoogleWorkspaceAuthorization,finishGoogleWorkspaceAuthorization} from "./google-workspace-oauth";
import {decryptField} from "./crypto-store";
const owner="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",company="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
const scope:GoogleWorkspace={userId:owner,mode:"business",companyId:company};
const clientId="fixture.apps.googleusercontent.com",nonce="n".repeat(43),state="s".repeat(43),session="fictitious-session";
const now=Date.parse("2026-10-13T12:00:00Z");
const bindingId="cccccccc-cccc-4ccc-8ccc-ccccccccccc1",grantId="dddddddd-dddd-4ddd-8ddd-ddddddddddd1";
const keys=generateKeyPairSync("rsa",{modulusLength:2048});
const certs={fixture:keys.publicKey.export({type:"spki",format:"pem"}).toString()};
const binding={id:bindingId,user_id:owner,mode:"business",company_id:company,grant_id:grantId,calendar_id:"primary",calendar_name:null,version:1,unlinked_at:null};
function signedToken(patch:Record<string,unknown>={}){
 const head=Buffer.from(JSON.stringify({alg:"RS256",kid:"fixture"})).toString("base64url");
 const body=Buffer.from(JSON.stringify({iss:"https://accounts.google.com",aud:clientId,sub:"fictitious-subject",iat:now/1000,exp:now/1000+3600,nonce,...patch})).toString("base64url");
 const signed=head+"."+body;return signed+"."+createSign("RSA-SHA256").update(signed).sign(keys.privateKey,"base64url");
}
type FixtureTokenResponse={tokens:Credentials;res:null};
let client:InstanceType<typeof google.auth.OAuth2>,exchange:ReturnType<typeof vi.fn<(code:string)=>Promise<FixtureTokenResponse>>>;
beforeEach(()=>{
 vi.useFakeTimers();vi.setSystemTime(now);vi.stubEnv("DATA_ENCRYPTION_KEY","fictitious-test-encryption-key-only");
 client=new google.auth.OAuth2({clientId,clientSecret:"fictitious-client-secret",redirectUri:"https://example.invalid/api/auth/google/callback"});
 mocks.authClient.mockReset().mockResolvedValue(client);
 exchange=vi.fn<(code:string)=>Promise<FixtureTokenResponse>>().mockResolvedValue({tokens:{access_token:"fictitious-new-access",refresh_token:"fictitious-new-refresh",expiry_date:now+3600_000,id_token:signedToken()},res:null});
 // Replace only the Promise-based code transport used by the broker; no real Google exchange.
 vi.spyOn(client,"getToken").mockImplementation(exchange as unknown as typeof client.getToken);
 type CertResponse=Awaited<ReturnType<typeof google.auth.OAuth2.prototype.getFederatedSignonCertsAsync>>;
 vi.spyOn(google.auth.OAuth2.prototype,"getFederatedSignonCertsAsync").mockResolvedValue({certs,format:"PEM" as CertResponse["format"]});
 mocks.rpc.mockReset().mockImplementation(async name=>({data:name==="zelo_google_grant_versions"?[]:name==="zelo_google_state_consume"?{user_id:owner,mode:"business",company_id:company,locale:"pt-PT",nonce_hash:createHash("sha256").update("google-oauth-nonce\0"+nonce).digest("hex"),expires_at:new Date(now+600_000).toISOString(),binding_version:"0"}:name==="zelo_google_binding_save"?binding:null,error:null}));
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();vi.useRealTimers();});
it.each([undefined,null,"01","-1","9223372036854775808"])("refuses invalid UI revision before configuration lookup (%s)",async revision=>{
 await expect(startGoogleWorkspaceAuthorization(scope,session,"pt-BR",revision as string)).rejects.toThrow("GOOGLE_AUTHORIZATION_INVALID");expect(mocks.authClient).not.toHaveBeenCalled();expect(mocks.rpc).not.toHaveBeenCalled();
});
it("reports a fixed stale initiation without returning a consent URL",async()=>{
 mocks.rpc.mockResolvedValue({data:null,error:{message:"GOOGLE_BINDING_CONFLICT"}});
 await expect(startGoogleWorkspaceAuthorization(scope,session,"pt-BR","0")).rejects.toThrow("GOOGLE_STATE_CONFLICT");expect(exchange).not.toHaveBeenCalled();
});
it("persists scoped hashed state and generates the existing scopes with a matching OIDC nonce",async()=>{
 const url=new URL(await startGoogleWorkspaceAuthorization(scope,session,"es","0"));
 expect(url.origin).toBe("https://accounts.google.com");
 const args=mocks.rpc.mock.calls[0][1];
 expect(args).toMatchObject({p_user_id:owner,p_mode:"business",p_company_id:company,p_locale:"es",p_binding_version:"0"});
 expect(mocks.rpc.mock.calls[0][0]).toBe("zelo_google_state_issue_expected");
 expect(args.p_nonce_hash).toBe(createHash("sha256").update("google-oauth-nonce\0"+url.searchParams.get("nonce")).digest("hex"));
 expect(url.searchParams.get("scope")?.split(" ")).toEqual(["https://www.googleapis.com/auth/calendar.events","https://www.googleapis.com/auth/calendar.calendarlist.readonly","openid","email"]);
 expect(url.searchParams.get("access_type")).toBe("offline");expect(url.searchParams.get("prompt")).toBe("consent");
 expect(url.toString()).not.toContain("fictitious-client-secret");expect(JSON.stringify(args)).not.toContain(session);
});
it("finishes in the captured company and returns metadata without tokens or SDK credentials",async()=>{
 const result=await finishGoogleWorkspaceAuthorization(owner,session,state,"fictitious-code");
 expect(result).toMatchObject({workspace:scope,locale:"pt-PT",cancelled:false,binding:{workspace:scope,calendarId:"primary"}});
 expect(exchange).toHaveBeenCalledWith("fictitious-code");
 const saved=mocks.rpc.mock.calls.find(([name])=>name==="zelo_google_binding_save")![1];
 expect(saved).toMatchObject({p_user_id:owner,p_company_id:company,p_binding_version:"0"});
 expect(decryptField(saved.p_access_ciphertext)).toBe("fictitious-new-access");
 for(const secret of ["fictitious-new-access","fictitious-new-refresh","fictitious-client-secret",signedToken()])expect(JSON.stringify(result)).not.toContain(secret);
 expect(mocks.rpc.mock.calls.map(([name])=>name)).toEqual(["zelo_google_state_consume","zelo_google_binding_get","zelo_google_grant_versions","zelo_google_grant_for_identity","zelo_google_binding_save"]);
});
it("refuses code exchange when the pre-exchange grant snapshot cannot be read",async()=>{
 const original=mocks.rpc.getMockImplementation()!;
 mocks.rpc.mockImplementation(async(...args)=>args[0]==="zelo_google_grant_versions"?{data:null,error:{message:"fictitious diagnostic"}}:original(...args));
 await expect(finishGoogleWorkspaceAuthorization(owner,session,state,"fictitious-code")).rejects.toThrow("GOOGLE_AUTHORIZATION_INVALID");expect(exchange).not.toHaveBeenCalled();
});
it("captures the start target before awaiting the configured OAuth client",async()=>{
 const mutable={...scope};mocks.authClient.mockImplementation(async()=>{mutable.companyId="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";return client;});
 await startGoogleWorkspaceAuthorization(mutable,session,"pt-BR","0");
 expect(mocks.rpc.mock.calls[0][1].p_company_id).toBe(company);
});
it.each(["", "bad code", "x".repeat(16385)])("rejects malformed authorization codes without provider effects %#",async code=>{
 await expect(finishGoogleWorkspaceAuthorization(owner,session,state,code)).rejects.toThrow("GOOGLE_AUTHORIZATION_INVALID");expect(exchange).not.toHaveBeenCalled();
});
it("consumes cancellation once without a provider call or binding change",async()=>{
 const result=await finishGoogleWorkspaceAuthorization(owner,session,state,null);
 expect(result).toMatchObject({cancelled:true,binding:null,workspace:scope,locale:"pt-PT"});
 expect(exchange).not.toHaveBeenCalled();expect(mocks.rpc.mock.calls.map(c=>c[0])).toEqual(["zelo_google_state_consume"]);
});
it("rejects unusable or foreign/expired state before exchanging a code",async()=>{
 mocks.rpc.mockResolvedValue({data:null,error:null});
 await expect(finishGoogleWorkspaceAuthorization(owner,session,state,"fictitious-code")).rejects.toThrow("GOOGLE_AUTHORIZATION_INVALID");
 expect(exchange).not.toHaveBeenCalled();
});
it("rechecks a changed binding revision before any code exchange",async()=>{
 mocks.rpc.mockImplementation(async name=>({data:name==="zelo_google_state_consume"?{user_id:owner,mode:"business",company_id:company,locale:"es",nonce_hash:createHash("sha256").update("google-oauth-nonce\0"+nonce).digest("hex"),expires_at:new Date(now+600_000).toISOString(),binding_version:"0"}:binding,error:null}));
 await expect(finishGoogleWorkspaceAuthorization(owner,session,state,"fictitious-code")).rejects.toThrow("GOOGLE_AUTHORIZATION_INVALID");
 expect(exchange).not.toHaveBeenCalled();
});
it("rejects an archived target reported by storage before exchange",async()=>{
 mocks.rpc.mockImplementation(async name=>({data:name==="zelo_google_state_consume"?{user_id:owner,mode:"business",company_id:company,locale:"es",nonce_hash:createHash("sha256").update("google-oauth-nonce\0"+nonce).digest("hex"),expires_at:new Date(now+600_000).toISOString(),binding_version:"0"}:null,error:name==="zelo_google_binding_get"?{message:"fictitious archive diagnostic"}:null}));
 await expect(finishGoogleWorkspaceAuthorization(owner,session,state,"fictitious-code")).rejects.toThrow("GOOGLE_AUTHORIZATION_INVALID");expect(exchange).not.toHaveBeenCalled();
});
it.each([{expiry_date:now},{expiry_date:null},{access_token:null},{id_token:null},{id_token:signedToken({nonce:"x".repeat(43)})}])("rejects malformed/invalid token response without saving credentials %#",async patch=>{
 exchange.mockResolvedValue({tokens:{access_token:"fictitious-new-access",refresh_token:"fictitious-new-refresh",expiry_date:now+3600_000,id_token:signedToken(),...patch},res:null});
 await expect(finishGoogleWorkspaceAuthorization(owner,session,state,"fictitious-code")).rejects.toThrow("GOOGLE_AUTHORIZATION_INVALID");
 expect(mocks.rpc.mock.calls.some(([name])=>name==="zelo_google_binding_save")).toBe(false);
});
it("hides provider diagnostics and never looks up the owner's legacy tokens",async()=>{
 exchange.mockRejectedValue(Error("fictitious provider diagnostic with private credentials"));
 const error=await finishGoogleWorkspaceAuthorization(owner,session,state,"fictitious-code").catch(e=>e);
 expect(error.message).toBe("GOOGLE_AUTHORIZATION_INVALID");expect(error.stack).not.toContain("private credentials");expect(error).not.toHaveProperty("cause");
 expect(mocks.rpc.mock.calls.every(([name])=>!name.includes("legacy"))).toBe(true);
});
it("refuses to start authorization after private state storage fails",async()=>{
 mocks.rpc.mockResolvedValue({data:null,error:{message:"fictitious storage diagnostic"}});
 await expect(startGoogleWorkspaceAuthorization(scope,session,"pt-BR","0")).rejects.toThrow("GOOGLE_AUTHORIZATION_INVALID");
 expect(exchange).not.toHaveBeenCalled();
});
it("rejects a grant refreshed during code exchange before the post-exchange identity lookup",async()=>{
 let revision="1";
 mocks.rpc.mockImplementation(async name=>({data:name==="zelo_google_state_consume"?{user_id:owner,mode:"business",company_id:company,locale:"pt-BR",nonce_hash:createHash("sha256").update("google-oauth-nonce\0"+nonce).digest("hex"),expires_at:new Date(now+600_000).toISOString(),binding_version:"0"}:name==="zelo_google_grant_versions"?[{subject:"fictitious-subject",version:revision}]:name==="zelo_google_grant_for_identity"?{id:grantId,user_id:owner,subject:"fictitious-subject",client_fingerprint:createHash("sha256").update("google-oauth-client\0"+clientId).digest("hex"),access_ciphertext:"enc:"+"QUFB".repeat(12),refresh_ciphertext:"enc:"+"QUFB".repeat(12),expires_at:new Date(now+3600_000).toISOString(),version:revision}:name==="zelo_google_binding_save"?binding:null,error:null}));
 exchange.mockImplementation(async()=>{revision="2";return {tokens:{access_token:"fictitious-delayed-access",refresh_token:"fictitious-delayed-refresh",expiry_date:now+3600_000,id_token:signedToken()},res:null as never};});
 await expect(finishGoogleWorkspaceAuthorization(owner,session,state,"fictitious-code")).rejects.toThrow("GOOGLE_AUTHORIZATION_INVALID");
 expect(mocks.rpc.mock.calls.some(([name])=>name==="zelo_google_binding_save")).toBe(false);
});
