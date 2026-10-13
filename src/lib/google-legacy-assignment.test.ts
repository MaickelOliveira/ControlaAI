import {google} from "googleapis";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import type {GoogleWorkspace} from "./google-workspace-policy";
const deps=vi.hoisted(()=>({rpc:vi.fn(),auth:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("./supabase",()=>({getSupabase:()=>deps}));
vi.mock("./google-oauth",()=>({getAuthClient:deps.auth}));
import {encryptField,decryptField} from "./crypto-store";
import {googleOAuthClientFingerprint} from "./google-oauth-state";
import {assignLegacyGoogleConnection,loadGoogleLegacyStatus} from "./google-legacy-assignment";
const owner="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",company="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
const bindingId="cccccccc-cccc-4ccc-8ccc-ccccccccccc1",grantId="dddddddd-dddd-4ddd-8ddd-ddddddddddd1";
const scope:GoogleWorkspace={userId:owner,mode:"business",companyId:company};
const clientId="fixture.apps.googleusercontent.com",subject="fixture-subject",now=Date.parse("2026-10-13T12:00:00Z"),source="a".repeat(64);
function binding(patch:Record<string,unknown>={}){return {id:bindingId,user_id:owner,mode:"business",company_id:company,grant_id:grantId,calendar_id:"fixture-calendar",calendar_name:"Fixture",version:"4",unlinked_at:null,...patch};}
function legacy(patch:Record<string,unknown>={}){return {user_id:owner,source_fingerprint:source,access_ciphertext:encryptField(JSON.stringify({token:"fixture-access",selectedCalendarId:"fixture-calendar",selectedCalendarName:"Old name"})),refresh_ciphertext:encryptField("fixture-refresh"),expires_at:new Date(now+1800_000).toISOString(),binding:binding({version:"3",unlinked_at:new Date(now-1000).toISOString()}),...patch};}
let client:InstanceType<typeof google.auth.OAuth2>,stored:ReturnType<typeof legacy>,providerInfo:Record<string,unknown>,calendar:Record<string,unknown>;
type TransportOptions=Parameters<InstanceType<typeof google.auth.OAuth2>["transporter"]["request"]>[0];
let transport:ReturnType<typeof vi.spyOn>;
beforeEach(()=>{
 vi.useFakeTimers();vi.setSystemTime(now);vi.stubEnv("DATA_ENCRYPTION_KEY","fictitious-test-encryption-key-only");
 client=new google.auth.OAuth2({clientId,clientSecret:"fictitious-client-secret"});deps.auth.mockReset().mockResolvedValue(client);
 stored=legacy();providerInfo={aud:clientId,sub:subject,expires_in:3600,scope:"https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.calendarlist.readonly openid email",email:"fictitious@example.invalid"};
 calendar={id:"fixture-calendar",summary:"Fixture",accessRole:"writer"};
 type Response=Awaited<ReturnType<typeof client.transporter.request>>;
 transport=vi.spyOn(client.transporter,"request").mockImplementation(async options=>{
  const url=String(options?.url);
  if(url!=="https://oauth2.googleapis.com/tokeninfo"&&!url.startsWith("https://www.googleapis.com/calendar/v3/users/me/calendarList/"))throw Error("Unexpected fixture transport");
  return {data:url.endsWith("tokeninfo")?providerInfo:calendar,status:200,statusText:"OK",headers:new Headers(),config:options} as Response;
 });
 deps.rpc.mockReset().mockImplementation(async name=>({data:name==="zelo_google_legacy_snapshot"?stored:name==="zelo_google_grant_versions"?[{subject,version:"7"}]:name==="zelo_google_legacy_assign"?binding():{exists:true,assigned:false,assignedHere:false},error:null}));
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();vi.useRealTimers();});
it("uses real SDK token-info and Calendar transport, exact pre-call revisions, and only returns binding metadata",async()=>{
 const original=JSON.stringify(stored);const result=await assignLegacyGoogleConnection(scope);
 expect(deps.rpc.mock.calls.map(([name])=>name)).toEqual(["zelo_google_legacy_snapshot","zelo_google_grant_versions","zelo_google_legacy_assign"]);
 const args=deps.rpc.mock.calls[2][1];
 expect(args).toMatchObject({p_user_id:owner,p_mode:"business",p_company_id:company,p_subject:subject,p_client_fingerprint:googleOAuthClientFingerprint(clientId),p_source_fingerprint:source,p_binding_version:"3",p_grant_version:"7",p_calendar_id:"fixture-calendar",p_calendar_name:"Fixture",p_expires_at:new Date(now+1800_000).toISOString()});
 expect(decryptField(args.p_access_ciphertext)).toBe("fixture-access");expect(decryptField(args.p_refresh_ciphertext)).toBe("fixture-refresh");
 expect(JSON.stringify(stored)).toBe(original);expect(Object.isFrozen(result)).toBe(true);expect(JSON.stringify(result)).not.toContain("fixture-access");expect(JSON.stringify(result)).not.toContain(subject);
 expect(transport).toHaveBeenCalledTimes(2);expect(client.credentials).toEqual({});
 expect(transport.mock.calls[0][0]).toMatchObject({method:"POST",headers:{authorization:"Bearer fixture-access"}});
 expect(transport.mock.calls[1][0].method).toBe("GET");
});
it("returns only immutable legacy flags without loading credentials or contacting Google",async()=>{
 const result=await loadGoogleLegacyStatus(scope);
 expect(result).toEqual({exists:true,assigned:false,assignedHere:false});expect(Object.isFrozen(result)).toBe(true);expect(transport).not.toHaveBeenCalled();expect(deps.auth).not.toHaveBeenCalled();
});
it("requires an explicit new connection for expired legacy without renewing or changing it",async()=>{
 stored.expires_at=new Date(now).toISOString();const original=JSON.stringify(stored);
 await expect(assignLegacyGoogleConnection(scope)).rejects.toThrow("GOOGLE_LEGACY_REAUTHORIZE_REQUIRED");
 expect(transport).not.toHaveBeenCalled();expect(JSON.stringify(stored)).toBe(original);expect(deps.rpc).toHaveBeenCalledTimes(1);
});
it("refuses a token-info subject missing even when an email and user_id are provided",async()=>{
 delete providerInfo.sub;providerInfo.user_id="fixture-user-id";
 await expect(assignLegacyGoogleConnection(scope)).rejects.toThrow("GOOGLE_LEGACY_REAUTHORIZE_REQUIRED");
 expect(transport).toHaveBeenCalledTimes(1);expect(deps.rpc.mock.calls.some(([name])=>name==="zelo_google_legacy_assign")).toBe(false);
});
it.each([{aud:"other-client"},{azp:"other-client"},{sub:""},{sub:"bad subject"},{sub:"x".repeat(256)},{expires_in:0},{expires_in:"bad"},{expiry_date:null},{scope:"openid email"},{scope:"https://www.googleapis.com/auth/calendar.events"}])("refuses unverified identity, client, expiry or permissions before Calendar or assignment %#",async patch=>{
 Object.assign(providerInfo,patch);
 await expect(assignLegacyGoogleConnection(scope)).rejects.toThrow("GOOGLE_LEGACY_REAUTHORIZE_REQUIRED");
 expect(transport).toHaveBeenCalledTimes(1);expect(deps.rpc).toHaveBeenCalledTimes(2);expect(client.credentials).toEqual({});
});
it("accepts the legacy full-calendar permission without requesting new permissions",async()=>{
 providerInfo.scope="https://www.googleapis.com/auth/calendar";await assignLegacyGoogleConnection(scope);
 expect(transport).toHaveBeenCalledTimes(2);expect(deps.rpc.mock.calls[2][1].p_subject).toBe(subject);
});
it.each([{accessRole:"reader"},{accessRole:"freeBusyReader"},{accessRole:null},{deleted:true},{id:"different-calendar"},{id:""},{summary:"bad\nsummary"}])("refuses inaccessible or different calendars without substituting primary %#",async patch=>{
 Object.assign(calendar,patch);
 await expect(assignLegacyGoogleConnection(scope)).rejects.toThrow("GOOGLE_LEGACY_REAUTHORIZE_REQUIRED");
 expect(transport).toHaveBeenCalledTimes(2);expect(deps.rpc).toHaveBeenCalledTimes(2);expect(client.credentials).toEqual({});
});
it("resolves a raw legacy access token's primary calendar to its verified stable ID",async()=>{
 stored.access_ciphertext=encryptField("fixture-access");stored.binding=null as never;
 deps.rpc.mockImplementation(async name=>({data:name==="zelo_google_legacy_snapshot"?stored:name==="zelo_google_grant_versions"?[]:binding({version:"1",calendar_id:"fixture-primary",calendar_name:null}),error:null}));
 calendar={id:"fixture-primary",accessRole:"owner",primary:true};
 const result=await assignLegacyGoogleConnection(scope);
 expect(String(transport.mock.calls[1][0].url)).toContain("/primary");expect(result.calendarId).toBe("fixture-primary");
 expect(deps.rpc.mock.calls[2][1]).toMatchObject({p_binding_version:"0",p_grant_version:"0",p_calendar_name:null});
});
it.each([false,undefined])("refuses a calendar not explicitly confirmed as primary when resolving that alias: %s",async primary=>{
 stored.access_ciphertext=encryptField("fixture-access");calendar={id:"fixture-secondary",summary:"Fixture",accessRole:"writer",primary};
 deps.rpc.mockImplementation(async name=>({data:name==="zelo_google_legacy_snapshot"?stored:name==="zelo_google_grant_versions"?[]:binding({calendar_id:"fixture-secondary"}),error:null}));
 await expect(assignLegacyGoogleConnection(scope)).rejects.toThrow("GOOGLE_LEGACY_REAUTHORIZE_REQUIRED");expect(deps.rpc).toHaveBeenCalledTimes(2);
});
it.each([{user_id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2"},{source_fingerprint:"bad"},{expires_at:"bad"},{access_ciphertext:"fixture-plaintext"},{refresh_ciphertext:"fixture-plaintext"},{access_ciphertext:"enc:"+"QUFB".repeat(12)}])("rejects foreign, plaintext or corrupt storage before provider calls %#",async patch=>{
 Object.assign(stored,patch);await expect(assignLegacyGoogleConnection(scope)).rejects.toThrow("GOOGLE_LEGACY_STORAGE_INVALID");
 expect(transport).not.toHaveBeenCalled();expect(deps.rpc).toHaveBeenCalledTimes(1);
});
it.each([{token:"fixture-access",selectedCalendarId:""},{token:"fixture-access",selectedCalendarId:null},{token:"fixture-access",selectedCalendarId:42},{token:"fixture-access",selectedCalendarId:"bad\nid"},{token:""},[],"fixture-access"])("refuses malformed legacy envelopes rather than changing the chosen calendar %#",async value=>{
 stored.access_ciphertext=encryptField(JSON.stringify(value));
 await expect(assignLegacyGoogleConnection(scope)).rejects.toThrow("GOOGLE_LEGACY_STORAGE_INVALID");expect(transport).not.toHaveBeenCalled();
});
it("rejects a broken JSON envelope without treating its bytes as an access token",async()=>{
 stored.access_ciphertext=encryptField('{"token":');
 await expect(assignLegacyGoogleConnection(scope)).rejects.toThrow("GOOGLE_LEGACY_STORAGE_INVALID");expect(transport).not.toHaveBeenCalled();
});
it("does not overwrite a target that the storage snapshot already reports as active",async()=>{
 stored.binding=binding();await expect(assignLegacyGoogleConnection(scope)).rejects.toThrow("GOOGLE_LEGACY_STORAGE_INVALID");expect(transport).not.toHaveBeenCalled();
});
it.each(["GOOGLE_LEGACY_ALREADY_ASSIGNED","GOOGLE_LEGACY_TARGET_CONNECTED"])("keeps a rejected original target untouched: %s",async message=>{
 deps.rpc.mockResolvedValue({data:null,error:{message}});
 await expect(assignLegacyGoogleConnection(scope)).rejects.toThrow(message);expect(transport).not.toHaveBeenCalled();
});
it("does not manufacture a connection when the legacy row is absent",async()=>{
 deps.rpc.mockResolvedValue({data:null,error:null});await expect(assignLegacyGoogleConnection(scope)).rejects.toThrow("GOOGLE_LEGACY_MISSING");expect(transport).not.toHaveBeenCalled();
});
it.each(["GOOGLE_LEGACY_CONFLICT","GOOGLE_LEGACY_ALREADY_ASSIGNED","GOOGLE_LEGACY_TARGET_CONNECTED"])("does not retry a lost source/binding/grant or assignment race: %s",async message=>{
 const original=JSON.stringify(stored);
 deps.rpc.mockImplementation(async name=>({data:name==="zelo_google_legacy_snapshot"?stored:name==="zelo_google_grant_versions"?[{subject,version:"9007199254740992"}]:null,error:name==="zelo_google_legacy_assign"?{message}:null}));
 await expect(assignLegacyGoogleConnection(scope)).rejects.toThrow(message);
 expect(deps.rpc.mock.calls[2][1].p_grant_version).toBe("9007199254740992");expect(deps.rpc).toHaveBeenCalledTimes(3);expect(JSON.stringify(stored)).toBe(original);
});
it.each([{company_id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2"},{unlinked_at:new Date(now).toISOString()},{version:"3"},{id:"cccccccc-cccc-4ccc-8ccc-ccccccccccc2"},{calendar_id:"different"},{calendar_name:"Other"}])("does not report inconsistent committed metadata as success %#",async patch=>{
 deps.rpc.mockImplementation(async name=>({data:name==="zelo_google_legacy_snapshot"?stored:name==="zelo_google_grant_versions"?[]:binding(patch),error:null}));
 await expect(assignLegacyGoogleConnection(scope)).rejects.toThrow("GOOGLE_LEGACY_STORAGE_INVALID");
});
it("captures the authenticated target before configuration or storage awaits",async()=>{
 const mutable={...scope};deps.auth.mockImplementation(async()=>{mutable.companyId="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";return client;});
 const result=await assignLegacyGoogleConnection(mutable);expect(result.workspace.companyId).toBe(company);
 expect(deps.rpc.mock.calls.every(([,args])=>args.p_company_id===company)).toBe(true);
});
it("uses the captured legacy source/revisions when caller memory changes during verification",async()=>{
 transport.mockImplementation(async(options:TransportOptions)=>{
  stored.source_fingerprint="b".repeat(64);stored.binding.version="12";
  return {data:String(options?.url).endsWith("tokeninfo")?providerInfo:calendar,status:200,statusText:"OK",headers:new Headers(),config:options} as never;
 });
 await assignLegacyGoogleConnection(scope);expect(deps.rpc.mock.calls[2][1]).toMatchObject({p_source_fingerprint:source,p_binding_version:"3",p_grant_version:"7"});
});
it("fails after an expired revision snapshot without adopting newer revisions",async()=>{
 transport.mockImplementation(async(options:TransportOptions)=>{vi.setSystemTime(now+600_000);return {data:String(options?.url).endsWith("tokeninfo")?providerInfo:calendar,status:200,statusText:"OK",headers:new Headers(),config:options} as never;});
 await expect(assignLegacyGoogleConnection(scope)).rejects.toThrow("GOOGLE_LEGACY_FAILED");expect(deps.rpc).toHaveBeenCalledTimes(2);
});
it("does not persist a token that expires during calendar verification",async()=>{
 stored.expires_at=new Date(now+300_000).toISOString();
 transport.mockImplementation(async(options:TransportOptions)=>{const isInfo=String(options?.url).endsWith("tokeninfo");if(!isInfo)vi.setSystemTime(now+300_000);return {data:isInfo?providerInfo:calendar,status:200,statusText:"OK",headers:new Headers(),config:options} as never;});
 await expect(assignLegacyGoogleConnection(scope)).rejects.toThrow("GOOGLE_LEGACY_REAUTHORIZE_REQUIRED");expect(deps.rpc).toHaveBeenCalledTimes(2);
});
it.each([401,403])("real SDK Calendar failure never refreshes the unassigned grant: %s",async status=>{
 const failure=Object.assign(Error("fictitious private provider diagnostic"),{response:{status,config:{url:"https://www.googleapis.com/calendar/v3/users/me/calendarList/fixture-calendar",data:undefined}}});let observed=false;
 transport.mockImplementation(async(options:TransportOptions)=>{if(String(options?.url).endsWith("tokeninfo"))return {data:providerInfo,status:200,statusText:"OK",headers:new Headers(),config:options} as never;observed=true;throw failure;});
 const error=await assignLegacyGoogleConnection(scope).catch(e=>e);
 expect(observed).toBe(true);expect(error.message).toBe("GOOGLE_LEGACY_REAUTHORIZE_REQUIRED");expect(error.stack).not.toContain("provider diagnostic");expect(error).not.toHaveProperty("cause");expect(transport).toHaveBeenCalledTimes(2);expect(deps.rpc).toHaveBeenCalledTimes(2);expect(client.credentials).toEqual({});
});
it("hides transport and database details including malformed status responses",async()=>{
 deps.rpc.mockRejectedValue(Error("fictitious private database diagnostic"));
 const error=await assignLegacyGoogleConnection(scope).catch(e=>e);expect(error.message).toBe("GOOGLE_LEGACY_STORAGE_UNAVAILABLE");expect(error.stack).not.toContain("database diagnostic");expect(error).not.toHaveProperty("cause");
 deps.rpc.mockResolvedValue({data:{exists:true,assigned:false,assignedHere:true,refresh_ciphertext:"fictitious-private"},error:null});
 await expect(loadGoogleLegacyStatus(scope)).rejects.toThrow("GOOGLE_LEGACY_STORAGE_INVALID");
});
it("drops private fields from status instead of exposing storage objects",async()=>{
 deps.rpc.mockResolvedValue({data:{exists:true,assigned:true,assignedHere:false,source_fingerprint:source,access_ciphertext:"fictitious-private"},error:null});
 const status=await loadGoogleLegacyStatus(scope);expect(status).toEqual({exists:true,assigned:true,assignedHere:false});
});
it("does not write plaintext if encryption becomes unavailable during verification",async()=>{
 transport.mockImplementation(async(options:TransportOptions)=>{if(!String(options?.url).endsWith("tokeninfo"))vi.stubEnv("DATA_ENCRYPTION_KEY",undefined);return {data:String(options?.url).endsWith("tokeninfo")?providerInfo:calendar,status:200,statusText:"OK",headers:new Headers(),config:options} as never;});
 const error=await assignLegacyGoogleConnection(scope).catch(e=>e);expect(error.message).toBe("GOOGLE_LEGACY_FAILED");expect(error.stack).not.toContain("DATA_ENCRYPTION_KEY");expect(deps.rpc).toHaveBeenCalledTimes(2);expect(client.credentials).toEqual({});
});
