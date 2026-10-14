import {afterEach,beforeEach,expect,it,vi} from "vitest";
import type {GoogleWorkspace} from "./google-workspace-policy";
const deps=vi.hoisted(()=>({session:vi.fn(),cookies:vi.fn(),scope:vi.fn(),connect:vi.fn(),legacy:vi.fn()}));
vi.mock("./auth",()=>({getSession:deps.session}));
vi.mock("next/headers",()=>({cookies:deps.cookies}));
vi.mock("./company-context",()=>({runWithCompanyRequest:(callback:()=>unknown)=>callback(),companyScopeFor:deps.scope}));
vi.mock("./google-settings-actions",()=>({connectGoogleSettings:deps.connect,assignLegacyGoogleSettings:deps.legacy}));
import * as connecting from "../app/api/google/connect/route";
import {POST as assign} from "../app/api/google/legacy/route";
import {googleSettingsWorkspaceView} from "./google-settings-service";
const scope:GoogleWorkspace={userId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",mode:"business",companyId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1"};
const expected={workspaceKey:googleSettingsWorkspaceView(scope).workspaceKey,expectedBindingVersion:"3"};
const request=(kind:string,body:unknown,origin="https://zelo.test",query="")=>new Request(`https://zelo.test/api/google/${kind}${query}`,{method:"POST",headers:{origin,"content-type":"application/json"},body:JSON.stringify(body)});
beforeEach(()=>{vi.resetAllMocks();deps.session.mockResolvedValue({sub:scope.userId,role:"client"});deps.cookies.mockResolvedValue({get:(name:string)=>name==="ca_session"?{value:"fictitious-private-session"}:undefined});deps.scope.mockResolvedValue(scope);deps.connect.mockResolvedValue({authorizationUrl:"https://accounts.google.com/o/oauth2/v2/auth?state=fictitious"});deps.legacy.mockResolvedValue({connected:true,bindingVersion:"4"});});
afterEach(()=>vi.unstubAllEnvs());
it("exposes connect only as a POST action, never an effectful GET navigation",()=>{expect(connecting).not.toHaveProperty("GET");expect(connecting.POST).toBeTypeOf("function");});
it("connect passes the validated server workspace and request session privately",async()=>{
 const response=await connecting.POST(request("connect",{...expected,locale:"pt-PT"}));expect(response.status).toBe(200);expect(deps.connect).toHaveBeenCalledExactlyOnceWith(scope,"fictitious-private-session",{...expected,locale:"pt-PT"});expect(response.headers.get("cache-control")).toBe("private, no-store");expect(await response.text()).not.toContain("private-session");
});
it("assign forwards only explicit destination expectations",async()=>{
 const response=await assign(request("legacy",{...expected,confirmTarget:true}));expect(response.status).toBe(200);expect(deps.legacy).toHaveBeenCalledExactlyOnceWith(scope,{...expected,confirmTarget:true});
});
it.each([null,{sub:scope.userId,role:"admin"}])("denies missing/admin sessions before either action %#",async session=>{
 deps.session.mockResolvedValue(session);expect((await connecting.POST(request("connect",{...expected,locale:"pt-BR"}))).status).toBe(401);expect((await assign(request("legacy",{...expected,confirmTarget:true}))).status).toBe(401);expect(deps.connect).not.toHaveBeenCalled();expect(deps.legacy).not.toHaveBeenCalled();
});
it("requires the actual client session cookie before issuing a state",async()=>{
 deps.cookies.mockResolvedValue({get:()=>undefined});expect((await connecting.POST(request("connect",{...expected,locale:"pt-BR"}))).status).toBe(401);expect(deps.connect).not.toHaveBeenCalled();
});
it.each(["https://attacker.invalid",""])("denies a direct cross-origin mutation: %s",async origin=>{
 expect((await connecting.POST(request("connect",{...expected,locale:"pt-BR"},origin))).status).toBe(403);expect((await assign(request("legacy",{...expected,confirmTarget:true},origin))).status).toBe(403);expect(deps.connect).not.toHaveBeenCalled();expect(deps.legacy).not.toHaveBeenCalled();
});
it("denies body/query ownership overrides and absent expectations",async()=>{
 expect((await connecting.POST(request("connect",{...expected,locale:"pt-BR",userId:scope.userId}))).status).toBe(400);
 expect((await assign(request("legacy",{...expected,confirmTarget:true},undefined,"?companyId=forged"))).status).toBe(400);
 expect((await assign(request("legacy",{}))).status).toBe(400);expect(deps.connect).not.toHaveBeenCalled();expect(deps.legacy).not.toHaveBeenCalled();
});
it.each(["GOOGLE_STATE_CONFLICT","GOOGLE_LEGACY_CONFLICT","GOOGLE_LEGACY_ALREADY_ASSIGNED","GOOGLE_LEGACY_TARGET_CONNECTED"])("returns an actionable concurrent conflict without details: %s",async code=>{
 deps.connect.mockRejectedValue(Error(code));const response=await connecting.POST(request("connect",{...expected,locale:"pt-BR"}));expect(response.status).toBe(409);expect(await response.json()).toMatchObject({code:"GOOGLE_SETTINGS_CONFLICT"});
});
it("explains an expired old credential and hides provider diagnostics",async()=>{
 deps.legacy.mockRejectedValueOnce(Error("GOOGLE_LEGACY_REAUTHORIZE_REQUIRED"));const expired=await assign(request("legacy",{...expected,confirmTarget:true}));expect(expired.status).toBe(400);expect(await expired.json()).toMatchObject({code:"GOOGLE_SETTINGS_REAUTHORIZE_REQUIRED"});
 deps.connect.mockRejectedValueOnce(Error("fictitious-private-provider-diagnostic"));const response=await connecting.POST(request("connect",{...expected,locale:"pt-BR"}));expect(response.status).toBe(503);expect(await response.text()).not.toContain("provider-diagnostic");
});
