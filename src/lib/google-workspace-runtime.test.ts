import {google} from "googleapis";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import type {GoogleWorkspace} from "./google-workspace-policy";
const deps=vi.hoisted(()=>({rpc:vi.fn(),auth:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("./supabase",()=>({getSupabase:()=>deps}));
vi.mock("./google-oauth",()=>({getAuthClient:deps.auth}));
import {encryptField,decryptField} from "./crypto-store";
import {googleOAuthClientFingerprint} from "./google-oauth-state";
import {withGoogleWorkspaceClient} from "./google-workspace-runtime";
const owner="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",company="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
const bindingId="cccccccc-cccc-4ccc-8ccc-ccccccccccc1",grantId="dddddddd-dddd-4ddd-8ddd-ddddddddddd1";
const scope:GoogleWorkspace={userId:owner,mode:"business",companyId:company};
const clientId="fixture.apps.googleusercontent.com",now=Date.parse("2026-10-13T12:00:00Z");
const selected={id:bindingId,user_id:owner,mode:"business",company_id:company,grant_id:grantId,calendar_id:"fixture-selected-calendar",calendar_name:"Fixture",version:"3",unlinked_at:null};
function stored(expires=now+3600_000,version="7",access="fixture-stored-access",refresh="fixture-stored-refresh"){
 return {binding:{...selected},grant:{id:grantId,user_id:owner,client_fingerprint:googleOAuthClientFingerprint(clientId),version,expires_at:new Date(expires).toISOString(),access_ciphertext:encryptField(access),refresh_ciphertext:encryptField(refresh)}};
}
let client:InstanceType<typeof google.auth.OAuth2>,current:ReturnType<typeof stored>;
beforeEach(()=>{
 vi.useFakeTimers();vi.setSystemTime(now);vi.stubEnv("DATA_ENCRYPTION_KEY","fictitious-test-encryption-key-only");
 client=new google.auth.OAuth2({clientId,clientSecret:"fictitious-client-secret"});deps.auth.mockReset().mockResolvedValue(client);
 current=stored();deps.rpc.mockReset().mockImplementation(async name=>({data:name==="zelo_google_runtime_get"?current:null,error:null}));
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();vi.useRealTimers();});
it("uses the persisted active binding with no refresh capability and clears credentials afterward",async()=>{
 const result=await withGoogleWorkspaceClient(scope,null,async(auth,binding)=>{
  expect(binding.workspace).toEqual(scope);expect(binding.calendarId).toBe("fixture-selected-calendar");
  expect(auth.credentials.access_token).toBe("fixture-stored-access");expect(auth.credentials.refresh_token).toBeUndefined();
  expect(auth.forceRefreshOnFailure).toBe(false);expect(auth.eagerRefreshThresholdMillis).toBe(0);
  return {calendarId:binding.calendarId};
 });
 expect(result).toEqual({calendarId:"fixture-selected-calendar"});expect(client.credentials).toEqual({});
 expect(JSON.stringify(result)).not.toContain("fixture-stored");
});
it("rejects a missing or unlinked connection without a Google effect or legacy fallback",async()=>{
 deps.rpc.mockResolvedValue({data:null,error:null});const effect=vi.fn();
 await expect(withGoogleWorkspaceClient(scope,null,effect)).rejects.toThrow("GOOGLE_RUNTIME_NOT_CONNECTED");expect(effect).not.toHaveBeenCalled();
 expect(deps.rpc.mock.calls.every(([name])=>name==="zelo_google_runtime_get")).toBe(true);
});
it("encrypts renewal against the captured grant version without replacing calendar metadata",async()=>{
 current=stored(now-1000);
 vi.spyOn(client,"refreshAccessToken").mockImplementation(async()=>({credentials:{access_token:"fixture-renewed-access",refresh_token:"fixture-renewed-refresh",expiry_date:now+3600_000},res:null as never}));
 deps.rpc.mockImplementation(async(name,args)=>{
  if(name==="zelo_google_grant_refresh"){
   expect(args).toMatchObject({p_grant_id:grantId,p_grant_version:"7",p_user_id:owner,p_company_id:company});
   current=stored(now+3600_000,"8",decryptField(args.p_access_ciphertext)!,decryptField(args.p_refresh_ciphertext)!);return {data:true,error:null};
  }return {data:current,error:null};
 });
 const result=await withGoogleWorkspaceClient(scope,null,async(auth,binding)=>({used:auth.credentials.access_token,calendarId:binding.calendarId}));
 expect(result).toEqual({used:"fixture-renewed-access",calendarId:"fixture-selected-calendar"});expect(current.binding).toEqual(selected);
});
it("uses only the committed race winner and never the rejected refresh result",async()=>{
 current=stored(now-1000);
 vi.spyOn(client,"refreshAccessToken").mockImplementation(async()=>({credentials:{access_token:"fixture-losing-access",expiry_date:now+3600_000},res:null as never}));
 deps.rpc.mockImplementation(async name=>{if(name==="zelo_google_grant_refresh"){current=stored(now+3600_000,"8","fixture-winning-access");return {data:false,error:null};}return {data:current,error:null};});
 await withGoogleWorkspaceClient(scope,null,async(auth)=>{expect(auth.credentials.access_token).toBe("fixture-winning-access");});
});
it("refuses an event reference tied to another binding/grant before any provider effect",async()=>{
 const effect=vi.fn();
 await expect(withGoogleWorkspaceClient(scope,{bindingId,grantId:"dddddddd-dddd-4ddd-8ddd-ddddddddddd2"},effect)).rejects.toThrow("GOOGLE_RUNTIME_CHANGED");expect(effect).not.toHaveBeenCalled();
});
it("does not revive a binding removed while renewal is in flight",async()=>{
 current=stored(now-1000);let removed=false;const effect=vi.fn();
 vi.spyOn(client,"refreshAccessToken").mockImplementation(async()=>{removed=true;return {credentials:{access_token:"fixture-late-renewal",expiry_date:now+3600_000},res:null as never};});
 deps.rpc.mockImplementation(async name=>({data:name==="zelo_google_grant_refresh"?false:removed?null:current,error:null}));
 await expect(withGoogleWorkspaceClient(scope,null,effect)).rejects.toThrow("GOOGLE_RUNTIME_NOT_CONNECTED");expect(effect).not.toHaveBeenCalled();expect(client.credentials).toEqual({});
});
it("preserves a calendar chosen during renewal and refuses the stale operation",async()=>{
 current=stored(now-1000);const effect=vi.fn();
 vi.spyOn(client,"refreshAccessToken").mockImplementation(async()=>{current.binding={...selected,calendar_id:"fixture-new-calendar",version:"4"};return {credentials:{access_token:"fixture-renewed",expiry_date:now+3600_000},res:null as never};});
 deps.rpc.mockImplementation(async name=>{if(name==="zelo_google_grant_refresh"){current.grant=stored(now+3600_000,"8").grant;return {data:true,error:null};}return {data:current,error:null};});
 await expect(withGoogleWorkspaceClient(scope,null,effect)).rejects.toThrow("GOOGLE_RUNTIME_CHANGED");expect(effect).not.toHaveBeenCalled();expect(current.binding.calendar_id).toBe("fixture-new-calendar");
});
it("refuses a different account reconnected during renewal",async()=>{
 current=stored(now-1000);const effect=vi.fn(),otherGrant="dddddddd-dddd-4ddd-8ddd-ddddddddddd2";
 vi.spyOn(client,"refreshAccessToken").mockImplementation(async()=>{current=stored();current.binding={...selected,grant_id:otherGrant,version:"4"};current.grant.id=otherGrant;return {credentials:{access_token:"fixture-stale-renewal",expiry_date:now+3600_000},res:null as never};});
 deps.rpc.mockImplementation(async name=>({data:name==="zelo_google_grant_refresh"?false:current,error:null}));
 await expect(withGoogleWorkspaceClient(scope,null,effect)).rejects.toThrow("GOOGLE_RUNTIME_CHANGED");expect(effect).not.toHaveBeenCalled();expect(current.grant.id).toBe(otherGrant);
});
it("denies an archive reported by the final storage recheck before a Calendar effect",async()=>{
 let reads=0;const effect=vi.fn();deps.rpc.mockImplementation(async()=>++reads===1?{data:current,error:null}:{data:null,error:{message:"fictitious private archive diagnostic"}});
 const error=await withGoogleWorkspaceClient(scope,null,effect).catch(e=>e);
 if(!(error instanceof Error))throw Error("Expected runtime error");
 expect(error.message).toBe("GOOGLE_RUNTIME_STORAGE_UNAVAILABLE");expect(error).not.toHaveProperty("cause");expect(error.stack).not.toContain("archive diagnostic");expect(effect).not.toHaveBeenCalled();
});
it.each(["owner","company","grant","client","plaintext","ciphertext","version","expiry","tombstone"])("rejects corrupted or cross-scope runtime data: %s",async kind=>{
 if(kind==="owner")current.binding.user_id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
 if(kind==="company")current.binding.company_id="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";
 if(kind==="grant")current.grant.id="dddddddd-dddd-4ddd-8ddd-ddddddddddd2";
 if(kind==="client")current.grant.client_fingerprint="0".repeat(64);
 if(kind==="plaintext")current.grant.access_ciphertext="fixture-plaintext";
 if(kind==="ciphertext")current.grant.access_ciphertext="enc:"+"QUFB".repeat(12);
 if(kind==="version")current.grant.version="0";
 if(kind==="expiry")current.grant.expires_at="invalid";
 if(kind==="tombstone")current.binding.unlinked_at=new Date(now).toISOString() as never;
 const effect=vi.fn();await expect(withGoogleWorkspaceClient(scope,null,effect)).rejects.toThrow();expect(effect).not.toHaveBeenCalled();expect(client.credentials).toEqual({});
});
it.each([{access_token:null},{refresh_token:""},{expiry_date:null},{expiry_date:now},{expiry_date:9e15}])("refuses malformed renewal without writing it or inventing expiry %#",async patch=>{
 current=stored(now-1000);const effect=vi.fn();
 vi.spyOn(client,"refreshAccessToken").mockImplementation(async()=>({credentials:{access_token:"fixture-renewed",expiry_date:now+3600_000,...patch},res:null as never}));
 await expect(withGoogleWorkspaceClient(scope,null,effect)).rejects.toThrow("GOOGLE_RUNTIME_FAILED");expect(effect).not.toHaveBeenCalled();
 expect(deps.rpc.mock.calls.some(([name])=>name==="zelo_google_grant_refresh")).toBe(false);
});
it("bounds a lost refresh race whose persisted credentials are still expired",async()=>{
 current=stored(now-1000);const effect=vi.fn();const refresh=vi.spyOn(client,"refreshAccessToken").mockImplementation(async()=>({credentials:{access_token:"fixture-loser",expiry_date:now+3600_000},res:null as never}));
 deps.rpc.mockImplementation(async name=>({data:name==="zelo_google_grant_refresh"?false:current,error:null}));
 await expect(withGoogleWorkspaceClient(scope,null,effect)).rejects.toThrow("GOOGLE_RUNTIME_CHANGED");expect(refresh).toHaveBeenCalledTimes(1);expect(effect).not.toHaveBeenCalled();
});
it.each([401,403])("the real SDK does not bypass CAS by refreshing or retrying a failed Calendar request: %s",async status=>{
 const providerError=Object.assign(Error("fictitious private provider diagnostic"),{response:{status,config:{url:"https://www.googleapis.com/calendar/v3/users/me/calendarList",data:undefined}}});
 const transport=vi.spyOn(client.transporter,"request").mockRejectedValue(providerError);
 let observedError:unknown;
 const error=await withGoogleWorkspaceClient(scope,null,async auth=>{
  try{return await auth.request({url:"https://www.googleapis.com/calendar/v3/users/me/calendarList",retry:false});}
  catch(error){observedError=error;throw error;}
 }).catch(e=>e);
 expect(observedError).toBe(providerError);expect(error.message).toBe("GOOGLE_RUNTIME_FAILED");expect(error.stack).not.toContain("provider diagnostic");expect(error).not.toHaveProperty("cause");expect(transport).toHaveBeenCalledTimes(1);expect(client.credentials).toEqual({});
});
it("preserves a rotated refresh token from the real SDK response before its credentials wrapper overwrites it",async()=>{
 current=stored(now-1000);
 type Response=Awaited<ReturnType<typeof client.transporter.request>>;
 vi.spyOn(client.transporter,"request").mockResolvedValue({data:{access_token:"fixture-real-sdk-access",refresh_token:"fixture-rotated-refresh",expires_in:3600},status:200,statusText:"OK",headers:new Headers(),config:{url:new URL("https://oauth2.googleapis.com/token"),headers:new Headers()}} as Response);
 deps.rpc.mockImplementation(async(name,args)=>{
  if(name==="zelo_google_grant_refresh"){current=stored(now+3600_000,"8",decryptField(args.p_access_ciphertext)!,decryptField(args.p_refresh_ciphertext)!);return {data:true,error:null};}
  return {data:current,error:null};
 });
 await withGoogleWorkspaceClient(scope,null,async()=>undefined);
 expect(decryptField(current.grant.refresh_ciphertext)).toBe("fixture-rotated-refresh");
 expect(client.listenerCount("tokens")).toBe(0);expect(client.credentials).toEqual({});
});
it("fails before a Google request if access expires inside the operation, with no implicit renewal",async()=>{
 const transport=vi.spyOn(client.transporter,"request").mockRejectedValue(Error("fixture: unexpected network call"));
 await expect(withGoogleWorkspaceClient(scope,null,async auth=>{vi.setSystemTime(now+3600_000);return auth.request({url:"https://www.googleapis.com/calendar/v3/users/me/calendarList",retry:false});})).rejects.toThrow("GOOGLE_RUNTIME_FAILED");
 expect(transport).not.toHaveBeenCalled();expect(client.credentials).toEqual({});
});
it("clears temporary credentials and hides diagnostics when the trusted callback fails",async()=>{
 const error=await withGoogleWorkspaceClient(scope,null,async()=>{throw Error("fictitious private callback diagnostic");}).catch(e=>e);
 expect(error.message).toBe("GOOGLE_RUNTIME_FAILED");expect(error.stack).not.toContain("callback diagnostic");expect(error).not.toHaveProperty("cause");expect(client.credentials).toEqual({});
});
it.each([null,"true",{}])("refuses a malformed CAS response instead of using a rejected renewal %#",async result=>{
 current=stored(now-1000);const effect=vi.fn();vi.spyOn(client,"refreshAccessToken").mockImplementation(async()=>({credentials:{access_token:"fixture-new",expiry_date:now+3600_000},res:null as never}));
 deps.rpc.mockImplementation(async name=>({data:name==="zelo_google_grant_refresh"?result:current,error:null}));
 await expect(withGoogleWorkspaceClient(scope,null,effect)).rejects.toThrow("GOOGLE_RUNTIME_STORAGE_INVALID");expect(effect).not.toHaveBeenCalled();
});
it("captures the authenticated target before awaiting configuration",async()=>{
 const mutable={...scope};deps.auth.mockImplementation(async()=>{mutable.companyId="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";return client;});
 await withGoogleWorkspaceClient(mutable,null,async(_,binding)=>{expect(binding.workspace.companyId).toBe(company);});
 expect(deps.rpc.mock.calls[0][1].p_company_id).toBe(company);
});
it("refuses to save renewal if encryption becomes unavailable and removes its SDK listener",async()=>{
 current=stored(now-1000);const effect=vi.fn();vi.spyOn(client,"refreshAccessToken").mockImplementation(async()=>{vi.stubEnv("DATA_ENCRYPTION_KEY",undefined);return {credentials:{access_token:"fixture-new",refresh_token:"fixture-new-refresh",expiry_date:now+3600_000},res:null as never};});
 await expect(withGoogleWorkspaceClient(scope,null,effect)).rejects.toThrow("GOOGLE_RUNTIME_FAILED");expect(effect).not.toHaveBeenCalled();expect(client.listenerCount("tokens")).toBe(0);expect(client.credentials).toEqual({});
 expect(deps.rpc.mock.calls.some(([name])=>name==="zelo_google_grant_refresh")).toBe(false);
});
