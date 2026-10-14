import {beforeEach,expect,it,vi} from "vitest";
import type {GoogleWorkspace} from "./google-workspace-policy";
const deps=vi.hoisted(()=>({expected:vi.fn(),start:vi.fn(),assign:vi.fn(),status:vi.fn()}));
vi.mock("./google-settings-service",async original=>({...await original<typeof import("./google-settings-service")>(),assertGoogleSettingsExpected:deps.expected,loadGoogleSettings:deps.status}));
vi.mock("./google-workspace-oauth",()=>({startGoogleWorkspaceAuthorization:deps.start}));
vi.mock("./google-legacy-assignment",()=>({assignLegacyGoogleConnection:deps.assign}));
import {googleSettingsWorkspaceView} from "./google-settings-service";
import {connectGoogleSettings,assignLegacyGoogleSettings} from "./google-settings-actions";
const scope:GoogleWorkspace={userId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",mode:"business",companyId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1"};
const input=()=>({workspaceKey:googleSettingsWorkspaceView(scope).workspaceKey,expectedBindingVersion:"3"});
const authorizationUrl="https://accounts.google.com/o/oauth2/v2/auth?state=fictitious-state";
const status=()=>({workspace:googleSettingsWorkspaceView(scope),activated:true,connected:true,bindingVersion:"4",selectedCalendar:{id:"fixture-calendar",name:"Fixture"},legacy:{exists:true,assigned:true,assignedHere:true}});
beforeEach(()=>{vi.resetAllMocks();deps.expected.mockResolvedValue(null);deps.start.mockResolvedValue(authorizationUrl);deps.assign.mockResolvedValue({version:"4",calendarId:"fixture-calendar",calendarName:"Fixture"});deps.status.mockResolvedValue(status());});
it.each([null,{}, {...input(),locale:"en"},{...input(),locale:"pt-BR",mode:"personal"},{...input(),locale:"pt-BR",expectedBindingVersion:3}])("rejects malformed connect input before issuing consent %#",async value=>{
 await expect(connectGoogleSettings(scope,"fictitious-session",value)).rejects.toThrow("GOOGLE_SETTINGS_INPUT_INVALID");expect(deps.expected).not.toHaveBeenCalled();expect(deps.start).not.toHaveBeenCalled();
});
it.each(["pt-BR","pt-PT","es"])("starts consent only for the confirmed %s target",async locale=>{
 const result=await connectGoogleSettings(scope,"fictitious-session",{...input(),locale});
 expect(deps.expected).toHaveBeenCalledExactlyOnceWith(scope,input());expect(deps.start).toHaveBeenCalledExactlyOnceWith(scope,"fictitious-session",locale,"3");expect(result).toEqual({authorizationUrl});expect(Object.isFrozen(result)).toBe(true);
});
it("does not start consent after a stale workspace or revision",async()=>{
 deps.expected.mockRejectedValue(Error("GOOGLE_SETTINGS_CONFLICT"));await expect(connectGoogleSettings(scope,"fictitious-session",{...input(),locale:"pt-BR"})).rejects.toThrow("GOOGLE_SETTINGS_CONFLICT");expect(deps.start).not.toHaveBeenCalled();
});
it("preserves the atomic issuer's concurrent revision conflict",async()=>{
 deps.start.mockRejectedValue(Error("GOOGLE_STATE_CONFLICT"));await expect(connectGoogleSettings(scope,"fictitious-session",{...input(),locale:"pt-BR"})).rejects.toThrow("GOOGLE_STATE_CONFLICT");
});
it.each([null,{}, {...input()},{...input(),confirmTarget:false},{...input(),confirmTarget:"true"},{...input(),confirmTarget:true,userId:scope.userId}])("requires an explicit legacy target confirmation %#",async value=>{
 await expect(assignLegacyGoogleSettings(scope,value)).rejects.toThrow("GOOGLE_SETTINGS_INPUT_INVALID");expect(deps.expected).not.toHaveBeenCalled();expect(deps.assign).not.toHaveBeenCalled();
});
it("returns only fresh public status after assigning the confirmed old connection",async()=>{
 const result=await assignLegacyGoogleSettings(scope,{...input(),confirmTarget:true});expect(deps.assign).toHaveBeenCalledExactlyOnceWith(scope,"3");expect(result).toEqual(status());expect(result).not.toHaveProperty("grantId");
});
it.each([{bindingVersion:"5"},{connected:false},{activated:false},{selectedCalendar:{id:"other",name:"Fixture"}},{selectedCalendar:{id:"fixture-calendar",name:"Other"}},{workspace:{...googleSettingsWorkspaceView(scope),workspaceKey:"a".repeat(64)}}])("does not report a different post-commit target as success %#",async patch=>{
 deps.status.mockResolvedValue({...status(),...patch});await expect(assignLegacyGoogleSettings(scope,{...input(),confirmTarget:true})).rejects.toThrow("GOOGLE_SETTINGS_CONFLICT");
});
it("captures scope and submitted fields before the first await",async()=>{
 const mutable={...scope},body={...input(),locale:"pt-BR"};deps.expected.mockImplementation(async()=>{mutable.companyId="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";body.expectedBindingVersion="8";body.locale="es";});
 await connectGoogleSettings(mutable,"fictitious-session",body);expect(deps.start).toHaveBeenCalledExactlyOnceWith(scope,"fictitious-session","pt-BR","3");
});
it.each(["provider authorization secret","GOOGLE_SETTINGS_PRIVATE_DIAGNOSTIC"])("hides unknown errors rather than trusting their prefix: %s",async message=>{
 deps.assign.mockRejectedValue(Error(message));const error=await assignLegacyGoogleSettings(scope,{...input(),confirmTarget:true}).catch(error=>error);expect(error.message).toBe("GOOGLE_SETTINGS_PROVIDER_UNAVAILABLE");expect(error.stack).not.toContain(message);expect(error).not.toHaveProperty("cause");
});
