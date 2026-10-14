import {AsyncLocalStorage} from "node:async_hooks";
import {google} from "googleapis";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import type {GoogleBinding} from "./google-binding-store";
import type {GoogleWorkspace} from "./google-workspace-policy";
const deps=vi.hoisted(()=>({auth:vi.fn(),authUser:vi.fn(),cookies:vi.fn(),company:vi.fn(),enabled:vi.fn(),binding:vi.fn(),legacy:vi.fn(),activation:vi.fn(),runtime:vi.fn(),rpc:vi.fn(),global:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("./auth",()=>({getSession:deps.auth,getSessionWithUser:deps.authUser,getAdminSession:async()=>null}));
vi.mock("next/headers",()=>({cookies:deps.cookies}));
vi.mock("./companies",()=>({multiCompanyEnabled:deps.enabled,COMPANY_COOKIE:"zelo_company",companyContextData:deps.company}));
vi.mock("./supabase",()=>({getSupabase:()=>deps}));
vi.mock("./google-binding-store",async importOriginal=>({...await importOriginal<typeof import("./google-binding-store")>(),loadGoogleBinding:deps.binding}));
vi.mock("./google-legacy-assignment",()=>({loadGoogleLegacyStatus:deps.legacy}));
vi.mock("./google-owner-activation",()=>({loadGoogleOwnerActivation:deps.activation}));
vi.mock("./google-workspace-runtime",()=>({withGoogleWorkspaceClient:deps.runtime}));
vi.mock("./google-oauth",()=>({isConnected:deps.global,getConnectedEmail:deps.global,listGoogleCalendars:deps.global,getSelectedCalendar:deps.global,selectGoogleCalendar:deps.global,revokeTokens:deps.global}));
import {GET as status} from "../app/api/google/status/route";
import {GET as calendars,PUT as select} from "../app/api/google/calendars/route";
import {POST as unlink} from "../app/api/google/disconnect/route";
import * as companyContext from "./company-context";
import {googleSettingsWorkspaceView} from "./google-settings-service";
const owner="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",company="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",otherCompany="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";
type Client={owner:string;company:string;mode:"personal"|"business";role:"client"|"admin";archived?:boolean};
const requests=new AsyncLocalStorage<Client>(),base:Client={owner,company,mode:"business",role:"client"};
const scope:GoogleWorkspace={userId:owner,mode:"business",companyId:company};
let records:Map<string,GoogleBinding>;
const key=(scope:GoogleWorkspace)=>googleSettingsWorkspaceView(scope).workspaceKey;
const expectView=(scope:GoogleWorkspace)=>({workspaceKey:key(scope),expectedBindingVersion:records.get(key(scope))?.version??"0"});
function binding(scope:GoogleWorkspace):GoogleBinding{return {id:"cccccccc-cccc-4ccc-8ccc-ccccccccccc1",workspace:{...scope},grantId:"dddddddd-dddd-4ddd-8ddd-ddddddddddd1",calendarId:"fixture-original",calendarName:"Fixture original",version:"3",unlinkedAt:null};}
function raw(binding:GoogleBinding){return {id:binding.id,user_id:binding.workspace.userId,mode:binding.workspace.mode,company_id:binding.workspace.companyId,grant_id:binding.grantId,calendar_id:binding.calendarId,calendar_name:binding.calendarName,version:binding.version,unlinked_at:binding.unlinkedAt};}
function request(path:string,method="GET",body?:unknown,headers:Record<string,string>={}){return new Request(`https://zelo.test/api/google/${path}`,{method,headers:{...(method==="GET"?{}:{origin:"https://zelo.test","content-type":"application/json"}),...headers},...(body===undefined?{}:{body:typeof body==="string"?body:JSON.stringify(body)})});}
function invoke(route:(request:Request)=>Promise<Response>,request:Request,client:Client=base){return requests.run(client,()=>route(request));}
beforeEach(()=>{
 vi.resetAllMocks();records=new Map([scope,{...scope,companyId:otherCompany},{...scope,mode:"personal" as const,companyId:null}].map(scope=>[key(scope),binding(scope)]));
 deps.enabled.mockReturnValue(true);deps.auth.mockImplementation(async()=>({sub:requests.getStore()!.owner,role:requests.getStore()!.role}));
 deps.authUser.mockImplementation(async()=>({session:{role:requests.getStore()!.role},user:{id:requests.getStore()!.owner,activeMode:requests.getStore()!.mode}}));
 deps.cookies.mockImplementation(async()=>({get:(name:string)=>name==="ca_session"?{value:"fictitious-session"}:name==="zelo_company"?{value:`${requests.getStore()!.owner}:${requests.getStore()!.company}`} :undefined}));
 deps.company.mockImplementation(async(_owner,id)=>({company:{id,name:"Same fixture name",...(requests.getStore()!.archived?{archivedAt:"2026-10-13"}:{})},archivedCompanyIds:requests.getStore()!.archived?[id]:[]}));
 deps.binding.mockImplementation(async scope=>records.get(key(scope))??null);deps.legacy.mockResolvedValue({exists:true,assigned:false,assignedHere:false});deps.activation.mockResolvedValue(true);
 deps.runtime.mockImplementation(async(scope,_reference,operation)=>{
  const auth=new google.auth.OAuth2({clientId:"fixture.apps.googleusercontent.com"});auth.setCredentials({access_token:"fixture-access",expiry_date:Date.now()+3600_000});auth.eagerRefreshThresholdMillis=0;
  vi.spyOn(auth.transporter,"request").mockResolvedValue({data:{id:"fixture-chosen",summary:"Fixture chosen",accessRole:"writer",items:[{id:"fixture-chosen",summary:"Fixture chosen",accessRole:"writer"}]},status:200} as never);
  return operation(auth,records.get(key(scope)));
 });
 deps.rpc.mockImplementation(async(name,args)=>{
  const scope:GoogleWorkspace={userId:args.p_user_id,mode:args.p_mode,companyId:args.p_company_id},record=records.get(key(scope));
  if(!record||record.version!==args.p_binding_version)return {data:null,error:{message:"GOOGLE_BINDING_CONFLICT"}};
  const changed={...record,version:String(BigInt(record.version)+BigInt(1)),...(name==="zelo_google_binding_unlink"?{unlinkedAt:"2026-10-13T15:00:00Z"}:{calendarId:args.p_calendar_id,calendarName:args.p_calendar_name})};
  records.set(key(scope),changed);return {data:raw(changed),error:null};
 });
 deps.global.mockResolvedValue(true);
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();});
it("actual status route resolves the authenticated company and exposes only private scoped metadata",async()=>{
 const result=await invoke(status,request("status"));expect(result.status).toBe(200);expect(result.headers.get("cache-control")).toBe("private, no-store");
 expect(result.headers.get("X-Zelo-Workspace-Key")).toBe(key(scope));
 expect(await result.json()).toMatchObject({workspace:googleSettingsWorkspaceView(scope),activated:true,connected:true,bindingVersion:"3"});
 expect(deps.company).toHaveBeenCalledWith(owner,company,"business");expect(deps.runtime).not.toHaveBeenCalled();expect(deps.global).not.toHaveBeenCalled();
});
it("status accepts optional matching correlation and rejects another tab's workspace before storage",async()=>{
 const accepted=await invoke(status,request("status","GET",undefined,{"X-Zelo-Workspace-Key":key(scope)}));expect(accepted.status).toBe(200);expect(accepted.headers.get("X-Zelo-Workspace-Key")).toBe(key(scope));
 deps.binding.mockClear();const stale=await invoke(status,request("status","GET",undefined,{"X-Zelo-Workspace-Key":key({...scope,companyId:otherCompany})}));
 expect(stale.status).toBe(409);expect(await stale.json()).toMatchObject({code:"GOOGLE_SETTINGS_WORKSPACE_CHANGED"});expect(deps.binding).not.toHaveBeenCalled();
 const empty=await invoke(status,request("status","GET",undefined,{"X-Zelo-Workspace-Key":""}));expect(empty.status).toBe(409);expect(deps.binding).not.toHaveBeenCalled();
});
it("settings writes keep mandatory body expectations and reject a mismatched optional correlation header",async()=>{
 const stale=await invoke(unlink,request("disconnect","POST",expectView(scope),{"X-Zelo-Workspace-Key":key({...scope,companyId:otherCompany})}));expect(stale.status).toBe(409);expect(await stale.json()).toMatchObject({code:"GOOGLE_SETTINGS_WORKSPACE_CHANGED"});expect(deps.rpc).not.toHaveBeenCalled();
 const missing=await invoke(unlink,request("disconnect","POST",{}, {"X-Zelo-Workspace-Key":key(scope)}));expect(missing.status).toBe(400);expect(deps.rpc).not.toHaveBeenCalled();
 const accepted=await invoke(unlink,request("disconnect","POST",expectView(scope),{"X-Zelo-Workspace-Key":key(scope)}));expect(accepted.status).toBe(200);expect(accepted.headers.get("X-Zelo-Workspace-Key")).toBe(key(scope));
});
it("keeps concurrent personal and two same-name company requests isolated",async()=>{
 const clients=[base,{...base,company:otherCompany},{...base,mode:"personal" as const}];
 const results=await Promise.all(clients.map(client=>invoke(status,request("status"),client)));
 expect(await Promise.all(results.map(result=>result.json()))).toEqual(clients.map(client=>expect.objectContaining({workspace:googleSettingsWorkspaceView({userId:client.owner,mode:client.mode,companyId:client.mode==="personal"?null:client.company})})));
});
it("actual calendars routes require stale-view expectations and commit only the selected company",async()=>{
 const view=expectView(scope),query=new URLSearchParams(view).toString();
 const listed=await invoke(calendars,request(`calendars?${query}`));expect(listed.status).toBe(200);expect(await listed.json()).toMatchObject({workspace:googleSettingsWorkspaceView(scope),bindingVersion:"3",calendars:[{id:"fixture-chosen",name:"Fixture chosen",primary:false}]});
 const selected=await invoke(select,request("calendars","PUT",{...view,calendarId:"fixture-chosen"}));expect(selected.status).toBe(200);expect(await selected.json()).toMatchObject({bindingVersion:"4",selectedCalendar:{id:"fixture-chosen",name:"Fixture chosen"}});
 expect(records.get(key({...scope,companyId:otherCompany}))?.calendarId).toBe("fixture-original");expect(deps.global).not.toHaveBeenCalled();
});
it("actual disconnect route preserves another binding and its shared grant without provider work",async()=>{
 const response=await invoke(unlink,request("disconnect","POST",expectView(scope)));expect(response.status).toBe(200);expect(await response.json()).toMatchObject({activated:true,connected:false,bindingVersion:"4"});
 const other=records.get(key({...scope,companyId:otherCompany}))!;expect(other.unlinkedAt).toBeNull();expect(other.grantId).toBe(records.get(key(scope))!.grantId);
 expect(deps.runtime).not.toHaveBeenCalled();expect(deps.global).not.toHaveBeenCalled();
});
it("denies missing/admin sessions with private errors before workspace/storage/provider resolution",async()=>{
 deps.auth.mockResolvedValueOnce(null);const guest=await invoke(status,request("status"));expect(guest.status).toBe(401);expect(await guest.json()).toMatchObject({code:"GOOGLE_SETTINGS_AUTH_REQUIRED"});
 const admin=await invoke(unlink,request("disconnect","POST",expectView(scope)),{...base,role:"admin"});expect(admin.status).toBe(401);
 for(const response of [guest,admin])expect(response.headers.get("cache-control")).toBe("private, no-store");expect(deps.binding).not.toHaveBeenCalled();expect(deps.company).not.toHaveBeenCalled();
});
it("rejects missing, trusted, foreign-owner and archived contexts without global fallback",async()=>{
 deps.enabled.mockReturnValueOnce(false);expect((await invoke(status,request("status"))).status).toBe(403);
 vi.spyOn(companyContext,"companyScopeFor").mockResolvedValueOnce({trusted:true} as never);expect((await invoke(status,request("status"))).status).toBe(403);
 vi.spyOn(companyContext,"companyScopeFor").mockResolvedValueOnce({...scope,companyId:company,userId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2"} as never);expect((await invoke(status,request("status"))).status).toBe(403);
 vi.restoreAllMocks();expect((await invoke(status,request("status"),{...base,archived:true})).status).toBe(403);expect(deps.binding).not.toHaveBeenCalled();expect(deps.global).not.toHaveBeenCalled();
});
it.each(["https://attacker.test",""])("direct mutation routes enforce origin independently of the proxy: %s",async origin=>{
 for(const [route,path,body] of [[unlink,"disconnect",expectView(scope)],[select,"calendars",{...expectView(scope),calendarId:"fixture-chosen"}]] as const){
  const response=await invoke(route,request(path,route===unlink?"POST":"PUT",body,{origin}));expect(response.status).toBe(403);expect(await response.json()).toMatchObject({code:"GOOGLE_SETTINGS_ORIGIN_DENIED"});
 }
 expect(deps.rpc).not.toHaveBeenCalled();expect(deps.runtime).not.toHaveBeenCalled();
});
it("uses the configured public origin behind a proxy and ignores forwarded host claims",async()=>{
 vi.stubEnv("APP_ORIGIN","https://zelo.test");vi.stubEnv("NODE_ENV","production");
 const proxied=(origin:string)=>new Request("http://localhost:3000/api/google/disconnect",{method:"POST",headers:{origin,"content-type":"application/json","x-forwarded-host":"attacker.test"},body:JSON.stringify(expectView(scope))});
 expect((await invoke(unlink,proxied("https://zelo.test"))).status).toBe(200);
 expect((await invoke(unlink,proxied("https://attacker.test"))).status).toBe(403);
});
it("fails production mutations closed when the configured public origin is absent",async()=>{
 vi.stubEnv("NODE_ENV","production");expect((await invoke(unlink,request("disconnect","POST",expectView(scope)))).status).toBe(403);expect(deps.rpc).not.toHaveBeenCalled();
});
it("rejects cross-site metadata even with a matching origin",async()=>{
 const response=await invoke(unlink,request("disconnect","POST",expectView(scope),{"sec-fetch-site":"cross-site"}));expect(response.status).toBe(403);expect(deps.rpc).not.toHaveBeenCalled();
});
it.each(["calendars", "calendars?userId=forged", "calendars?workspaceKey=x&expectedBindingVersion=3&expectedBindingVersion=4"])("rejects missing/extra/repeated query fields before provider work: %s",async path=>{
 const response=await invoke(calendars,request(path));expect(response.status).toBe(400);expect(response.headers.get("cache-control")).toBe("private, no-store");expect(deps.runtime).not.toHaveBeenCalled();
});
it("status and mutation routes refuse query identity overrides",async()=>{
 expect((await invoke(status,request("status?mode=personal"))).status).toBe(400);
 expect((await invoke(unlink,request("disconnect?companyId=forged","POST",expectView(scope)))).status).toBe(400);
 expect(deps.rpc).not.toHaveBeenCalled();
});
it.each([null,[],{},"{broken",{workspaceKey:"x",expectedBindingVersion:3},{workspaceKey:"x",expectedBindingVersion:"3",userId:owner}])("rejects invalid JSON/shapes/extra ownership before effects %#",async body=>{
 const response=await invoke(unlink,request("disconnect","POST",body));expect(response.status).toBe(400);expect(deps.rpc).not.toHaveBeenCalled();expect(deps.runtime).not.toHaveBeenCalled();
});
it("bounds actual JSON bytes and rejects unsupported content types before effect",async()=>{
 expect((await invoke(unlink,request("disconnect","POST"," ".repeat(4097)))).status).toBe(400);
 expect((await invoke(select,request("calendars","PUT",{...expectView(scope),calendarId:"fixture-chosen"},{"content-type":"text/plain"}))).status).toBe(400);
 expect(deps.rpc).not.toHaveBeenCalled();expect(deps.runtime).not.toHaveBeenCalled();
});
it("measures actual bytes even when content-length understates the body",async()=>{
 const response=await invoke(unlink,request("disconnect","POST"," ".repeat(4097),{"content-length":"1"}));
 expect(response.status).toBe(400);expect(deps.rpc).not.toHaveBeenCalled();
});
it("rejects invalid UTF-8 before interpreting a calendar selection",async()=>{
 const serialized=JSON.stringify({...expectView(scope),calendarId:"fixture-corrupt"}),bytes=new TextEncoder().encode(serialized);
 bytes[serialized.indexOf("fixture-corrupt")]=255;
 const malformed=new Request("https://zelo.test/api/google/calendars",{method:"PUT",headers:{origin:"https://zelo.test","content-type":"application/json"},body:bytes});
 expect((await invoke(select,malformed)).status).toBe(400);expect(deps.rpc).not.toHaveBeenCalled();expect(deps.runtime).not.toHaveBeenCalled();
});
it("rejects a stale company or binding revision with safe conflict codes",async()=>{
 const response=await invoke(unlink,request("disconnect","POST",expectView({...scope,companyId:otherCompany})));expect(response.status).toBe(409);expect(await response.json()).toMatchObject({code:"GOOGLE_SETTINGS_WORKSPACE_CHANGED"});
 const stale=await invoke(select,request("calendars","PUT",{...expectView(scope),expectedBindingVersion:"2",calendarId:"fixture-chosen"}));expect(stale.status).toBe(409);expect(await stale.json()).toMatchObject({code:"GOOGLE_SETTINGS_CONFLICT"});expect(deps.rpc).not.toHaveBeenCalled();
});
it("sanitizes unexpected authentication/storage errors rather than returning diagnostics",async()=>{
 deps.auth.mockRejectedValueOnce(Object.assign(Error("private fixture session diagnostic"),{cause:"private fixture cause"}));
 const result=await invoke(status,request("status"));expect(result.status).toBe(503);expect(await result.json()).toMatchObject({code:"GOOGLE_SETTINGS_UNAVAILABLE"});
 deps.binding.mockRejectedValueOnce(Error("GOOGLE_BINDING_STORAGE_UNAVAILABLE"));const unavailable=await invoke(status,request("status"));expect(unavailable.status).toBe(503);expect(await unavailable.text()).not.toContain("private fixture");
});
