import {afterEach,beforeEach,expect,it,vi} from "vitest";
import type {GoogleWorkspace} from "./google-workspace-policy";
const deps=vi.hoisted(()=>({rpc:vi.fn(),auth:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("./supabase",()=>({getSupabase:()=>deps}));
vi.mock("./google-oauth",()=>({getAuthClient:deps.auth}));
import {googleEventRetryIdentity} from "./google-event-policy";
import {googleOAuthClientFingerprint} from "./google-oauth-state";
import {loadGoogleEventIntent,reserveGoogleEventIntent} from "./google-event-origin-store";
const owner="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",company="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",eventId="eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1";
const bindingId="cccccccc-cccc-4ccc-8ccc-ccccccccccc1",grantId="dddddddd-dddd-4ddd-8ddd-ddddddddddd1",clientId="fixture.apps.googleusercontent.com";
const scope:GoogleWorkspace={userId:owner,mode:"business",companyId:company};
function binding(patch:Record<string,unknown>={}){return {id:bindingId,user_id:owner,mode:"business",company_id:company,grant_id:grantId,calendar_id:"fixture-calendar",calendar_name:"Fixture",version:"7",unlinked_at:null,...patch};}
function intent(patch:Record<string,unknown>={}){const ids=googleEventRetryIdentity(scope,eventId);return {event_id:eventId,user_id:owner,mode:"business",company_id:company,binding_id:bindingId,grant_id:grantId,calendar_id:"fixture-calendar",binding_version:"7",remote_event_id:ids.remoteEventId,conference_request_id:ids.conferenceRequestId,...patch};}
beforeEach(()=>{
 deps.auth.mockReset().mockResolvedValue({_clientId:clientId});
 deps.rpc.mockReset().mockImplementation(async name=>({data:name==="zelo_google_binding_get"?binding():intent(),error:null}));
});
afterEach(()=>vi.restoreAllMocks());
it("loads only immutable scoped history metadata without Google credentials or legacy fallback",async()=>{
 deps.rpc.mockResolvedValue({data:intent({access_ciphertext:"fictitious-private",subject:"fictitious-subject"}),error:null});
 const result=await loadGoogleEventIntent(scope,eventId);
 expect(result).toEqual({workspace:scope,eventId,bindingId,grantId,calendarId:"fixture-calendar",...googleEventRetryIdentity(scope,eventId),bindingVersion:"7"});
 expect(Object.isFrozen(result)).toBe(true);expect(Object.isFrozen(result?.workspace)).toBe(true);expect(JSON.stringify(result)).not.toContain("fictitious");expect(deps.auth).not.toHaveBeenCalled();
 expect(deps.rpc.mock.calls[0]).toEqual(["zelo_google_event_origin_get",{p_user_id:owner,p_mode:"business",p_company_id:company,p_event_id:eventId}]);
});
it("reserves the original active binding/grant/calendar and revision with the configured client",async()=>{
 const result=await reserveGoogleEventIntent(scope,eventId);
 expect(result.bindingId).toBe(bindingId);expect(deps.rpc.mock.calls.map(([name])=>name)).toEqual(["zelo_google_binding_get","zelo_google_event_origin_reserve"]);
 expect(deps.rpc.mock.calls[1][1]).toEqual({p_user_id:owner,p_mode:"business",p_company_id:company,p_event_id:eventId,p_binding_id:bindingId,p_grant_id:grantId,p_binding_version:"7",p_client_fingerprint:googleOAuthClientFingerprint(clientId)});
});
it("does not infer a historical origin when none exists",async()=>{
 deps.rpc.mockResolvedValue({data:null,error:null});expect(await loadGoogleEventIntent(scope,eventId)).toBeNull();expect(deps.rpc).toHaveBeenCalledTimes(1);
});
it("requires an active connection before reserving an intent",async()=>{
 deps.rpc.mockResolvedValue({data:null,error:null});await expect(reserveGoogleEventIntent(scope,eventId)).rejects.toThrow("GOOGLE_EVENT_NOT_CONNECTED");expect(deps.rpc).toHaveBeenCalledTimes(1);
});
it.each([{user_id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2"},{company_id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2"},{event_id:"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2"},{mode:"personal"},{binding_id:"bad"},{grant_id:"bad"},{calendar_id:""},{binding_version:"0"},{binding_version:7},{binding_version:"9223372036854775808"},{remote_event_id:"0".repeat(64)},{conference_request_id:"0".repeat(64)}])("rejects corrupt/foreign history metadata or altered retry identity %#",async patch=>{
 deps.rpc.mockResolvedValue({data:intent(patch),error:null});await expect(loadGoogleEventIntent(scope,eventId)).rejects.toThrow("GOOGLE_EVENT_STORAGE_INVALID");expect(deps.auth).not.toHaveBeenCalled();
});
it.each([{binding_id:"cccccccc-cccc-4ccc-8ccc-ccccccccccc2"},{grant_id:"dddddddd-dddd-4ddd-8ddd-ddddddddddd2"},{calendar_id:"another-calendar"},{binding_version:"8"}])("does not report a reservation against another captured target as success %#",async patch=>{
 deps.rpc.mockImplementation(async name=>({data:name==="zelo_google_binding_get"?binding():intent(patch),error:null}));
 await expect(reserveGoogleEventIntent(scope,eventId)).rejects.toThrow("GOOGLE_EVENT_STORAGE_INVALID");expect(deps.rpc).toHaveBeenCalledTimes(2);
});
it("does not reserve an event using a locally unlinked binding",async()=>{
 deps.rpc.mockResolvedValue({data:binding({unlinked_at:"2026-10-13T12:00:00Z"}),error:null});
 await expect(reserveGoogleEventIntent(scope,eventId)).rejects.toThrow("GOOGLE_EVENT_NOT_CONNECTED");expect(deps.rpc).toHaveBeenCalledTimes(1);
});
it.each([{user_id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2"},{company_id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2"}])("denies a foreign binding returned during reservation %#",async patch=>{
 deps.rpc.mockResolvedValue({data:binding(patch),error:null});await expect(reserveGoogleEventIntent(scope,eventId)).rejects.toThrow("GOOGLE_EVENT_STORAGE_INVALID");expect(deps.rpc).toHaveBeenCalledTimes(1);
});
it.each(["GOOGLE_EVENT_CONNECTION_CHANGED","GOOGLE_EVENT_ORIGIN_CONFLICT","GOOGLE_EVENT_INVALID"])("never retries a rejected reservation with newer metadata: %s",async message=>{
 deps.rpc.mockImplementation(async name=>({data:name==="zelo_google_binding_get"?binding():null,error:name==="zelo_google_event_origin_reserve"?{message}:null}));
 await expect(reserveGoogleEventIntent(scope,eventId)).rejects.toThrow(message);expect(deps.rpc).toHaveBeenCalledTimes(2);
});
it("preserves exact decimal creation revisions beyond the JavaScript safe-integer range",async()=>{
 const revision="9223372036854775806";
 deps.rpc.mockImplementation(async name=>({data:name==="zelo_google_binding_get"?binding({version:revision}):intent({binding_version:revision}),error:null}));
 expect((await reserveGoogleEventIntent(scope,eventId)).bindingVersion).toBe(revision);expect(deps.rpc.mock.calls[1][1].p_binding_version).toBe(revision);
});
it("canonicalizes UUIDs before storage calls while retaining immutable captured scope",async()=>{
 const upper={...scope,userId:owner.toUpperCase(),companyId:company.toUpperCase()};
 await reserveGoogleEventIntent(upper,eventId.toUpperCase());expect(deps.rpc.mock.calls[1][1]).toMatchObject({p_user_id:owner,p_company_id:company,p_event_id:eventId});expect(upper.companyId).toBe(company.toUpperCase());
});
it("captures the target before configuration await and ignores a later company switch",async()=>{
 const mutable={...scope};deps.auth.mockImplementation(async()=>{mutable.companyId="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";return {_clientId:clientId};});
 const result=await reserveGoogleEventIntent(mutable,eventId);expect(result.workspace.companyId).toBe(company);expect(deps.rpc.mock.calls.every(([,args])=>args.p_company_id===company)).toBe(true);
});
it("captures the target before an asynchronous history response",async()=>{
 const mutable={...scope};deps.rpc.mockImplementation(async()=>{mutable.companyId="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";return {data:intent(),error:null};});
 expect((await loadGoogleEventIntent(mutable,eventId))?.workspace.companyId).toBe(company);
});
it("uses the originally loaded immutable binding even when its source object changes during the reservation",async()=>{
 const source=binding();deps.rpc.mockImplementation(async name=>{if(name==="zelo_google_binding_get")return {data:source,error:null};source.calendar_id="changed";source.version="8";return {data:intent(),error:null};});
 const result=await reserveGoogleEventIntent(scope,eventId);expect(result.calendarId).toBe("fixture-calendar");expect(result.bindingVersion).toBe("7");
});
it("keeps Personal separate and never substitutes a remembered company",async()=>{
 const personal:GoogleWorkspace={userId:owner,mode:"personal",companyId:null},ids=googleEventRetryIdentity(personal,eventId);
 deps.rpc.mockImplementation(async name=>({data:name==="zelo_google_binding_get"?binding({mode:"personal",company_id:null}):intent({mode:"personal",company_id:null,remote_event_id:ids.remoteEventId,conference_request_id:ids.conferenceRequestId}),error:null}));
 const result=await reserveGoogleEventIntent(personal,eventId);expect(result.workspace).toEqual(personal);expect(deps.rpc.mock.calls.every(([,args])=>args.p_company_id===null&&args.p_mode==="personal")).toBe(true);
});
it.each([null,"",42])("rejects an unusable configured client before storage %#",async id=>{
 deps.auth.mockResolvedValue({_clientId:id});await expect(reserveGoogleEventIntent(scope,eventId)).rejects.toThrow("GOOGLE_EVENT_CONFIGURATION_INVALID");expect(deps.rpc).not.toHaveBeenCalled();
});
it.each([null,"bad",""])("rejects an invalid authorized event UUID before configuration/storage %#",async id=>{
 await expect(reserveGoogleEventIntent(scope,id as string)).rejects.toThrow("GOOGLE_EVENT_INPUT_INVALID");expect(deps.rpc).not.toHaveBeenCalled();expect(deps.auth).not.toHaveBeenCalled();
});
it("rejects an invalid personal tuple rather than clearing its claimed company",async()=>{
 await expect(loadGoogleEventIntent({...scope,mode:"personal"},eventId)).rejects.toThrow("GOOGLE_EVENT_INPUT_INVALID");expect(deps.rpc).not.toHaveBeenCalled();
});
it("hides storage diagnostics and error causes on both history and reservation",async()=>{
 deps.rpc.mockRejectedValue(Error("fictitious private database diagnostic"));
 for(const action of [()=>loadGoogleEventIntent(scope,eventId),()=>reserveGoogleEventIntent(scope,eventId)]){
  const error=await action().catch(e=>e);expect(error.message).toBe("GOOGLE_EVENT_STORAGE_UNAVAILABLE");expect(error.stack).not.toContain("database diagnostic");expect(error).not.toHaveProperty("cause");
 }
});
it("hides configuration diagnostics instead of returning the SDK or secret-bearing error",async()=>{
 deps.auth.mockRejectedValue(Error("fictitious private configuration diagnostic"));
 const error=await reserveGoogleEventIntent(scope,eventId).catch(e=>e);expect(error.message).toBe("GOOGLE_EVENT_FAILED");expect(error.stack).not.toContain("configuration diagnostic");expect(error).not.toHaveProperty("cause");expect(deps.rpc).not.toHaveBeenCalled();
});
it.each([null,{},[]])("does not accept a missing/malformed reservation result as a committed intent %#",async data=>{
 deps.rpc.mockImplementation(async name=>({data:name==="zelo_google_binding_get"?binding():data,error:null}));
 await expect(reserveGoogleEventIntent(scope,eventId)).rejects.toThrow("GOOGLE_EVENT_STORAGE_INVALID");
});
