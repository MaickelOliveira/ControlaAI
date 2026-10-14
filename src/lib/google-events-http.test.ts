import {AsyncLocalStorage} from "node:async_hooks";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import type {GoogleWorkspace} from "./google-workspace-policy";
const deps=vi.hoisted(()=>({auth:vi.fn(),authUser:vi.fn(),cookies:vi.fn(),company:vi.fn(),enabled:vi.fn(),storage:vi.fn(),provider:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("./auth",()=>({getSession:deps.auth,getSessionWithUser:deps.authUser,getAdminSession:async()=>null}));
vi.mock("next/headers",()=>({cookies:deps.cookies}));
vi.mock("./companies",()=>({multiCompanyEnabled:deps.enabled,COMPANY_COOKIE:"zelo_company",companyContextData:deps.company}));
vi.mock("./supabase",()=>({getSupabase:deps.storage}));
vi.mock("./google-workspace-runtime",()=>({withGoogleWorkspaceClient:deps.provider}));
import {assertGoogleWorkspaceHeader,googleEventsBody,googleEventsHttp,googleEventsQuery} from "./google-events-http";
import * as companyContext from "./company-context";
import {googleSettingsWorkspaceView} from "./google-settings-service";
const owner="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",company="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",otherCompany="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";
type Client={owner:string;company:string;mode:"personal"|"business";role:"client"|"admin";archived?:boolean};
const requests=new AsyncLocalStorage<Client>(),base:Client={owner,company,mode:"business",role:"client"};
const scope:GoogleWorkspace={userId:owner,mode:"business",companyId:company};
const key=(scope:GoogleWorkspace)=>googleSettingsWorkspaceView(scope).workspaceKey;
function request(method="GET",body?:unknown,headers:Record<string,string>={},query=""){
 return new Request(`https://zelo.test/api/agenda${query}`,{method,headers:{...(method==="GET"?{}:{origin:"https://zelo.test","content-type":"application/json","X-Zelo-Workspace-Key":key(scope)}),...headers},...(body===undefined?{}:{body:typeof body==="string"?body:JSON.stringify(body)})});
}
function invoke(request:Request,action:(scope:GoogleWorkspace)=>Promise<unknown>,client:Client=base,mutation=false,status=200){return requests.run(client,()=>googleEventsHttp(request,action,mutation,status));}
beforeEach(()=>{
 vi.resetAllMocks();deps.enabled.mockReturnValue(true);
 deps.auth.mockImplementation(async()=>({sub:requests.getStore()!.owner,role:requests.getStore()!.role}));
 deps.authUser.mockImplementation(async()=>({session:{role:requests.getStore()!.role},user:{id:requests.getStore()!.owner,activeMode:requests.getStore()!.mode}}));
 deps.cookies.mockImplementation(async()=>({get:(name:string)=>name==="ca_session"?{value:"fictitious-session"}:name==="zelo_company"?{value:`${requests.getStore()!.owner}:${requests.getStore()!.company}`}:undefined}));
 deps.company.mockImplementation(async(_owner,id)=>({company:{id,name:"Same fixture name",...(requests.getStore()!.archived?{archivedAt:"2026-10-13"}:{})},archivedCompanyIds:requests.getStore()!.archived?[id]:[]}));
});
afterEach(()=>{expect(deps.storage).not.toHaveBeenCalled();expect(deps.provider).not.toHaveBeenCalled();vi.restoreAllMocks();vi.unstubAllEnvs();});
it("read-only legacy requests use authenticated scope and echo its correlation key without a provider",async()=>{
 const action=vi.fn(async selected=>({appointment:{title:"Fixture"},mode:selected.mode}));const result=await invoke(request(),action);
 expect(result.status).toBe(200);expect(result.headers.get("cache-control")).toBe("private, no-store");expect(result.headers.get("X-Zelo-Workspace-Key")).toBe(key(scope));
 expect(await result.json()).toEqual({appointment:{title:"Fixture"},mode:"business"});expect(action).toHaveBeenCalledExactlyOnceWith(scope);expect(Object.isFrozen(action.mock.calls[0][0])).toBe(true);
});
it("runs concurrent personal and same-name company actions with independent request scopes",async()=>{
 const clients=[base,{...base,company:otherCompany},{...base,mode:"personal" as const}];let release!:()=>void;const wait=new Promise<void>(resolve=>{release=resolve;});
 const pending=clients.map(client=>invoke(request(),async selected=>{await wait;const current=await companyContext.companyScopeFor(selected.userId);expect(current?.userId).toBe(selected.userId);expect(current?.mode).toBe(selected.mode);if(selected.mode==="business")expect(current?.companyId).toBe(selected.companyId);return selected;},client));
 release();const responses=await Promise.all(pending);
 for(const [index,response] of responses.entries()){
  const selected:GoogleWorkspace={userId:owner,mode:clients[index].mode,companyId:clients[index].mode==="personal"?null:clients[index].company};
  expect(await response.json()).toEqual(selected);expect(response.headers.get("X-Zelo-Workspace-Key")).toBe(key(selected));
 }
});
it("captures authenticated owner before asynchronous company selection and never trusts the header as authority",async()=>{
 const session={sub:owner,role:"client"};deps.auth.mockResolvedValue(session);
 vi.spyOn(companyContext,"companyScopeFor").mockImplementation(async selected=>{session.sub="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";expect(selected).toBe(owner);return {...scope,companyId:otherCompany};});
 const action=vi.fn(async()=>({ok:true}));const result=await invoke(request("GET",undefined,{"X-Zelo-Workspace-Key":key(scope)}),action);
 expect(result.status).toBe(409);expect(await result.json()).toMatchObject({code:"GOOGLE_SETTINGS_WORKSPACE_CHANGED"});expect(action).not.toHaveBeenCalled();
});
it("rejects absent or admin authentication before resolving company data or action",async()=>{
 const action=vi.fn();deps.auth.mockResolvedValueOnce(null);const guest=await invoke(request(),action),admin=await invoke(request(),action,{...base,role:"admin"});
 for(const result of [guest,admin]){expect(result.status).toBe(401);expect(result.headers.get("cache-control")).toBe("private, no-store");expect(await result.json()).toMatchObject({code:"GOOGLE_EVENT_AUTH_REQUIRED"});}
 expect(action).not.toHaveBeenCalled();expect(deps.company).not.toHaveBeenCalled();
});
it("denies absent, trusted, mismatched owner and archived contexts without fallback",async()=>{
 const action=vi.fn();deps.enabled.mockReturnValueOnce(false);expect((await invoke(request(),action)).status).toBe(403);
 vi.spyOn(companyContext,"companyScopeFor").mockResolvedValueOnce({trusted:true} as never);expect((await invoke(request(),action)).status).toBe(403);
 vi.spyOn(companyContext,"companyScopeFor").mockResolvedValueOnce({...scope,userId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2"} as never);expect((await invoke(request(),action)).status).toBe(403);
 vi.restoreAllMocks();expect((await invoke(request(),action,{...base,archived:true})).status).toBe(403);expect(action).not.toHaveBeenCalled();
});
it.each(["",key({...scope,companyId:otherCompany}),"forged"])('rejects a provided stale or malformed read header "%s" before action',async header=>{
 const action=vi.fn();const result=await invoke(request("GET",undefined,{"X-Zelo-Workspace-Key":header}),action);
 expect(result.status).toBe(409);expect(await result.json()).toMatchObject({code:"GOOGLE_SETTINGS_WORKSPACE_CHANGED"});expect(action).not.toHaveBeenCalled();
});
it("allows matching read correlation and requires matching correlation even for local-only metadata writes",async()=>{
 expect((await invoke(request("GET",undefined,{"X-Zelo-Workspace-Key":key(scope)}),async()=>[])).status).toBe(200);
 const req=request("PATCH",{status:"done"});const action=vi.fn(async selected=>({scope:selected,body:await googleEventsBody(req,["status","googleSyncVersion","clientMutationId"],["status"])}));
 const accepted=await invoke(req,action,base,true);expect(accepted.status).toBe(200);expect(await accepted.json()).toEqual({scope,body:{status:"done"}});expect(accepted.headers.get("X-Zelo-Workspace-Key")).toBe(key(scope));
 for(const req of [request("PATCH",{status:"done"}),request("PATCH",{status:"done"},{"X-Zelo-Workspace-Key":key({...scope,companyId:otherCompany})})]){
  if(req.headers.get("X-Zelo-Workspace-Key")===key(scope))req.headers.delete("X-Zelo-Workspace-Key");const action=vi.fn();const rejected=await invoke(req,action,base,true);
  expect(rejected.status).toBe(409);expect(await rejected.json()).toMatchObject({code:"GOOGLE_SETTINGS_WORKSPACE_CHANGED"});expect(action).not.toHaveBeenCalled();
 }
});
it("echoes successful 201 acknowledgements only after the action resolves",async()=>{
 const action=vi.fn(async()=>({id:"fixture-local-id"}));const result=await invoke(request("POST",{}),action,base,true,201);
 expect(result.status).toBe(201);expect(result.headers.get("X-Zelo-Workspace-Key")).toBe(key(scope));expect(await result.json()).toEqual({id:"fixture-local-id"});
});
it.each(["https://attacker.test",""])("direct mutations enforce same-origin independently of proxy middleware: %s",async origin=>{
 const action=vi.fn();const result=await invoke(request("DELETE",{},{origin}),action,base,true);expect(result.status).toBe(403);expect(await result.json()).toMatchObject({code:"GOOGLE_EVENT_ORIGIN_DENIED"});expect(action).not.toHaveBeenCalled();
});
it("uses configured public origin behind a reverse proxy and denies cross-site or forged forwarding",async()=>{
 vi.stubEnv("APP_ORIGIN","https://zelo.test");vi.stubEnv("NODE_ENV","production");const action=vi.fn(async()=>({ok:true}));
 const proxied=(origin:string,site="same-origin")=>new Request("http://localhost:3000/api/agenda",{method:"PATCH",headers:{origin,"sec-fetch-site":site,"x-forwarded-host":"attacker.test","X-Zelo-Workspace-Key":key(scope)},body:"{}"});
 expect((await invoke(proxied("https://zelo.test"),action,base,true)).status).toBe(200);
 expect((await invoke(proxied("https://attacker.test"),action,base,true)).status).toBe(403);expect((await invoke(proxied("https://zelo.test","cross-site"),action,base,true)).status).toBe(403);expect(action).toHaveBeenCalledTimes(1);
});
it("fails production mutations closed without configured public origin",async()=>{
 vi.stubEnv("NODE_ENV","production");const action=vi.fn();expect((await invoke(request("POST",{}),action,base,true)).status).toBe(403);expect(action).not.toHaveBeenCalled();
});
it.each([
 ["GOOGLE_EVENT_COMMAND_CONFLICT",409,"GOOGLE_EVENT_CONFLICT"],["GOOGLE_EVENT_CONNECTION_CHANGED",409,"GOOGLE_EVENT_CONFLICT"],["GOOGLE_EVENT_ORIGIN_CONFLICT",409,"GOOGLE_EVENT_CONFLICT"],["GOOGLE_EVENT_LOCAL_CONFLICT",409,"GOOGLE_EVENT_CONFLICT"],["GOOGLE_EVENT_LOCAL_INACTIVE",409,"GOOGLE_EVENT_CONFLICT"],["GOOGLE_EVENT_ATTEMPT_CONFLICT",409,"GOOGLE_EVENT_CONFLICT"],["GOOGLE_RUNTIME_CHANGED",409,"GOOGLE_EVENT_CONFLICT"],
 ["GOOGLE_EVENT_ORIGIN_MISSING",404,"GOOGLE_EVENT_NOT_FOUND"],["GOOGLE_EVENT_ACCESS_DENIED",403,"GOOGLE_EVENT_ACCESS_DENIED"],
 ["GOOGLE_EVENT_INPUT_INVALID",400,"GOOGLE_EVENT_INPUT_INVALID"],["GOOGLE_EVENT_COMMAND_INVALID",400,"GOOGLE_EVENT_INPUT_INVALID"],["GOOGLE_EVENT_INVALID",400,"GOOGLE_EVENT_INPUT_INVALID"],["GOOGLE_EVENT_PAYLOAD_INVALID",400,"GOOGLE_EVENT_INPUT_INVALID"],["GOOGLE_EVENT_IDENTITY_INVALID",400,"GOOGLE_EVENT_INPUT_INVALID"],
 ["GOOGLE_EVENT_NOT_CONNECTED",400,"GOOGLE_EVENT_NOT_CONNECTED"],["GOOGLE_RUNTIME_NOT_CONNECTED",400,"GOOGLE_EVENT_NOT_CONNECTED"],
 ["GOOGLE_EVENT_CONFIGURATION_INVALID",503,"GOOGLE_EVENT_UNAVAILABLE"],["GOOGLE_EVENT_STORAGE_INVALID",503,"GOOGLE_EVENT_UNAVAILABLE"],["GOOGLE_EVENT_STORAGE_UNAVAILABLE",503,"GOOGLE_EVENT_UNAVAILABLE"],["GOOGLE_EVENT_FAILED",503,"GOOGLE_EVENT_UNAVAILABLE"],["GOOGLE_EVENT_SYNC_UNAVAILABLE",503,"GOOGLE_EVENT_UNAVAILABLE"],["GOOGLE_RUNTIME_STORAGE_INVALID",503,"GOOGLE_EVENT_UNAVAILABLE"],["GOOGLE_RUNTIME_STORAGE_UNAVAILABLE",503,"GOOGLE_EVENT_UNAVAILABLE"],["GOOGLE_RUNTIME_FAILED",503,"GOOGLE_EVENT_UNAVAILABLE"],
 ["private fixture storage diagnostic",503,"GOOGLE_EVENT_UNAVAILABLE"],["GOOGLE_EVENT_COMMAND_UNKNOWN_PRIVATE",503,"GOOGLE_EVENT_UNAVAILABLE"],["__proto__",503,"GOOGLE_EVENT_UNAVAILABLE"],
])("sanitizes fixed service failure %s as %s",async(message,status,code)=>{
 const result=await invoke(request(),async()=>{throw Object.assign(Error(message),{cause:"private fixture cause",token:"fictitious"});});
 expect(result.status).toBe(status);expect(result.headers.get("cache-control")).toBe("private, no-store");expect(result.headers.get("X-Zelo-Workspace-Key")).toBeNull();expect(await result.json()).toEqual({code,error:expect.any(String)});
});
it("does not serialize unexpected authentication errors or thrown objects",async()=>{
 deps.auth.mockRejectedValueOnce(Error("private fixture auth diagnostic"));const action=vi.fn();const result=await invoke(request(),action);
 expect(result.status).toBe(503);expect(await result.text()).not.toContain("private fixture");expect(action).not.toHaveBeenCalled();
 const unknown=await invoke(request(),async()=>{throw {code:"GOOGLE_EVENT_ACCESS_DENIED",message:"private fixture object diagnostic"};});expect(unknown.status).toBe(503);expect(await unknown.text()).not.toContain("private fixture");
});
it("strict query helpers deny absent, duplicate and unknown keys including ownership selectors",()=>{
 expect(googleEventsQuery(request())).toEqual({});expect(googleEventsQuery(request("GET",undefined,{},"?version=v1%3A1%3A0%3A0"),["version"])).toEqual({version:"v1:1:0:0"});
 for(const suffix of ["?ownerId=forged","?mode=personal","?version=1&version=2","?version=1&companyId=forged",""])expect(()=>googleEventsQuery(request("GET",undefined,{},suffix),["version"])).toThrow("GOOGLE_EVENT_INPUT_INVALID");
});
it("captures input key allowlists before awaiting streamed JSON and projects only explicitly present optional keys",async()=>{
 let deliver!:()=>void;const body=new ReadableStream<Uint8Array>({start(controller){deliver=()=>{controller.enqueue(new TextEncoder().encode('{"status":"done"}'));controller.close();};}});
 const req=new Request("https://zelo.test/api/agenda",{method:"PATCH",headers:{"content-type":"application/json"},body,duplex:"half"} as RequestInit);
 const allowed=["status","googleSyncVersion"],required=["status"],pending=googleEventsBody(req,allowed,required);allowed.splice(0,2,"ownerId");required.splice(0,1,"ownerId");deliver();
 const value=await pending;expect(value).toEqual({status:"done"});expect(Object.isFrozen(value)).toBe(true);
});
it.each([null,[],{},"{broken",{title:"Fixture",ownerId:owner},{title:"Fixture",companyId:company},{title:"Fixture",__scope:{mode:"personal"}}])("rejects malformed body shapes and ownership extras %#",async body=>{
 await expect(googleEventsBody(request("POST",body),["title","description"],["title"])).rejects.toThrow("GOOGLE_EVENT_INPUT_INVALID");
});
it("rejects unsupported JSON content type, invalid UTF-8 and invalid caller allowlists",async()=>{
 await expect(googleEventsBody(request("POST",{title:"Fixture"},{"content-type":"text/plain"}),["title"])).rejects.toThrow("GOOGLE_EVENT_INPUT_INVALID");
 const bytes=new TextEncoder().encode('{"title":"Fixture"}');bytes[10]=255;
 const invalid=new Request("https://zelo.test/api/agenda",{method:"POST",headers:{"content-type":"application/json"},body:bytes});await expect(googleEventsBody(invalid,["title"])).rejects.toThrow("GOOGLE_EVENT_INPUT_INVALID");
 await expect(googleEventsBody(request("POST",{title:"Fixture"}),["title"],["ownerId"])).rejects.toThrow("GOOGLE_EVENT_INPUT_INVALID");
});
it("bounds actual JSON bytes to 32 KiB even with a false content length and counts multibyte text",async()=>{
 const exact=JSON.stringify({title:"a".repeat(32768-12)});expect(new TextEncoder().encode(exact)).toHaveLength(32768);
 expect((await googleEventsBody(request("POST",exact),["title"])).title).toHaveLength(32768-12);
 await expect(googleEventsBody(request("POST",`${exact} `,{"content-length":"1"}),["title"])).rejects.toThrow("GOOGLE_EVENT_INPUT_INVALID");
 await expect(googleEventsBody(request("POST",{title:"é".repeat(17000)}),["title"])).rejects.toThrow("GOOGLE_EVENT_INPUT_INVALID");
});
it("header assertion is a stale-view guard and never changes the supplied server scope",()=>{
 expect(assertGoogleWorkspaceHeader(request(),scope)).toBe(key(scope));expect(()=>assertGoogleWorkspaceHeader(request(),scope,true)).toThrow("GOOGLE_SETTINGS_WORKSPACE_CHANGED");
 expect(()=>assertGoogleWorkspaceHeader(request("GET",undefined,{"X-Zelo-Workspace-Key":key({...scope,mode:"personal",companyId:null})}),scope)).toThrow("GOOGLE_SETTINGS_WORKSPACE_CHANGED");expect(scope).toEqual({userId:owner,mode:"business",companyId:company});
});
