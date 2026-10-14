import {afterEach,beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({session:vi.fn(),scope:vi.fn(),settings:vi.fn(),list:vi.fn(),create:vi.fn(),update:vi.fn(),cancel:vi.fn(),retry:vi.fn(),inspect:vi.fn(),confirm:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/auth",()=>({getSession:m.session}));
vi.mock("@/lib/company-context",async original=>({...await original<typeof import("./company-context")>(),companyScopeFor:m.scope}));
vi.mock("@/lib/google-event-service",()=>({listWorkspaceAppointments:m.list,createWorkspaceAppointment:m.create,getWorkspaceAppointment:vi.fn(),updateWorkspaceAppointment:m.update,cancelWorkspaceAppointment:m.cancel,retryWorkspaceGoogleEvent:m.retry,inspectWorkspaceGoogleEventConflict:m.inspect,confirmWorkspaceGoogleEventConflict:m.confirm}));
vi.mock("@/lib/google-settings-service",async original=>({...await original<typeof import("./google-settings-service")>(),loadGoogleSettings:m.settings}));
import {createGoogleAgendaController} from "./google-agenda-client";
import {googleSettingsWorkspaceView} from "./google-settings-service";
import {GET as list,POST as create} from "../app/api/agenda/route";
import {PATCH,DELETE} from "../app/api/agenda/[id]/route";
import {POST as retry} from "../app/api/agenda/[id]/retry/route";
import {GET as inspectConflict,POST as confirmConflict} from "../app/api/agenda/[id]/conflict/route";
import {GET as status} from "../app/api/google/status/route";
const owner="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",company="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",id="cccccccc-cccc-4ccc-8ccc-ccccccccccc1";
const scope={userId:owner,companyId:company,mode:"business" as const},target={...googleSettingsWorkspaceView(scope),label:"Fixture company"};
const record={id,title:"Fixture",startAt:"2026-10-20T12:00:00Z",allDay:false,repeat:"none",status:"scheduled",source:"web",createdAt:"2026-10-14T12:00:00Z",googleSyncVersion:"v1:9007199254740993:1:0",googleSyncState:"waiting",googleSyncFailureCode:null,googleMeetPending:false,googleCancellationPending:false};
let controller:ReturnType<typeof createGoogleAgendaController>,lost:string|null,requests:Request[];
/** Request transport dispatches actual handlers and HTTP guards unchanged. Only
 * auth resolution/private DAL services are mocked; no generated HTTP responses. */
async function transport(url:string,init:RequestInit={}):Promise<Response>{
 const headers=new Headers(init.headers);if(init.method&&init.method!=="GET")headers.set("Origin","https://zelo.test");
 const request=new Request(`https://zelo.test${url}`,{...init,headers});requests.push(request.clone());
 const context={params:Promise.resolve({id})};let response:Response;
 if(url==="/api/google/status")response=await status(request);
 else if(url==="/api/agenda")response=request.method==="POST"?await create(request):await list(request);
 else if(url===`/api/agenda/${id}`&&request.method==="PATCH")response=await PATCH(request,context);
 else if(url===`/api/agenda/${id}`&&request.method==="DELETE")response=await DELETE(request,context);
 else if(url===`/api/agenda/${id}/retry`&&request.method==="POST")response=await retry(request,context);
 else if(new URL(request.url).pathname===`/api/agenda/${id}/conflict`)response=request.method==="GET"?await inspectConflict(request,context):await confirmConflict(request,context);
 else throw Error("FIXTURE_ROUTE_NOT_FOUND");
 if(lost===request.method){lost=null;throw Error("FIXTURE_RESPONSE_LOST");}return response;
}
beforeEach(()=>{
 vi.clearAllMocks();vi.stubEnv("APP_ORIGIN","https://zelo.test");lost=null;requests=[];
 m.session.mockResolvedValue({sub:owner,role:"client"});m.scope.mockResolvedValue({...scope,allowPersonal:true,allowBusiness:true});m.settings.mockResolvedValue({workspace:googleSettingsWorkspaceView(scope),activated:true,connected:true,bindingVersion:"1",selectedCalendar:null,legacy:{status:"none"}});
 m.list.mockResolvedValue([record]);m.create.mockImplementation(async(_scope,uuid,input)=>({...record,...input,id:uuid}));m.update.mockImplementation(async(_scope,_id,patch)=>({...record,...patch}));m.cancel.mockResolvedValue({...record,status:"cancelled",googleCancellationPending:true,googleSyncState:"queued"});m.retry.mockResolvedValue({...record,googleSyncState:"queued"});
 let sequence=0;controller=createGoogleAgendaController({fetch:transport,uuid:()=>`00000000-0000-4000-8000-${String(++sequence).padStart(12,"0")}`,changed:()=>{}});
});
afterEach(()=>{vi.unstubAllEnvs();});
it("controller creation reaches the real route with one logical UUID and confirmed pending DTO",async()=>{
 await controller.setTarget(target);expect(controller.state().googleConnected).toBe(true);const uuid=controller.newIntent();
 const created=await controller.create(uuid,{title:"Created",startAt:record.startAt,withMeet:true});expect(created).toMatchObject({id:uuid,title:"Created",googleSyncState:"waiting"});expect(m.create).toHaveBeenCalledExactlyOnceWith(scope,uuid,{title:"Created",startAt:record.startAt,withMeet:true},"web");expect(controller.state().errorCode).toBeNull();
});
it("controller edit reaches strict real PATCH with expected version and no conference removal",async()=>{
 await controller.setTarget(target);const original=controller.state().appointments[0];expect(await controller.patch(controller.newIntent(),original,{title:"Edited",withMeet:false})).toMatchObject({title:"Edited"});
 expect(m.update).toHaveBeenCalledWith(scope,id,{title:"Edited"},{clientMutationId:expect.any(String),expectedGoogleSyncVersion:record.googleSyncVersion});expect(controller.state().errorCode).toBeNull();
});
it("controller completion satisfies strict real PATCH and retains identity after a lost acknowledgement",async()=>{
 await controller.setTarget(target);lost="PATCH";expect(await controller.done(controller.state().appointments[0])).toBeNull();expect(await controller.done(controller.state().appointments[0])).toMatchObject({status:"done"});
 expect(m.update).toHaveBeenCalledTimes(2);expect(m.update.mock.calls[0]).toEqual(m.update.mock.calls[1]);expect(m.update.mock.calls[0]).toEqual([scope,id,{status:"done"},{clientMutationId:expect.any(String),expectedGoogleSyncVersion:record.googleSyncVersion}]);
});
it("controller DELETE and explicit retry use the actual strict routes and retain exact original expectations",async()=>{
 await controller.setTarget(target);await controller.remove(controller.state().appointments[0]);expect(m.cancel).toHaveBeenCalledWith(scope,id,{clientMutationId:expect.any(String),expectedGoogleSyncVersion:record.googleSyncVersion});expect(controller.state().appointments[0]).toMatchObject({status:"cancelled",googleCancellationPending:true});
 lost="POST";await controller.retry(controller.state().appointments[0]);await controller.retry(controller.state().appointments[0]);expect(m.retry).toHaveBeenCalledTimes(2);expect(m.retry.mock.calls[0]).toEqual(m.retry.mock.calls[1]);expect(m.retry.mock.calls[0][2]).toEqual({clientMutationId:expect.any(String),expectedGoogleSyncVersion:record.googleSyncVersion});
 expect(requests.filter(req=>req.method==="POST").map(req=>new URL(req.url).pathname)).toEqual([`/api/agenda/${id}/retry`,`/api/agenda/${id}/retry`]);
});
it("real stale workspace guard prevents metadata effects and blocks the old client target",async()=>{
 await controller.setTarget(target);m.scope.mockResolvedValue({...scope,companyId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2",allowBusiness:true});await controller.done(controller.state().appointments[0]);expect(m.update).not.toHaveBeenCalled();expect(controller.state()).toMatchObject({target,appointments:[],errorCode:"AGENDA_WORKSPACE_CHANGED"});
});
it("real conflict refresh keeps the original revision/UUID even after the list has advanced",async()=>{
 await controller.setTarget(target);const original=controller.state().appointments[0],intent=controller.newIntent();m.update.mockRejectedValueOnce(Error("GOOGLE_EVENT_COMMAND_CONFLICT"));m.list.mockResolvedValue([{...record,googleSyncVersion:"v1:9007199254740993:2:0"}]);
 await controller.patch(intent,original,{title:"Edited"});expect(controller.state().errorCode).toBe("AGENDA_CONFLICT");await controller.patch(intent,original,{title:"Edited"});expect(m.update.mock.calls[0]).toEqual(m.update.mock.calls[1]);expect(m.update.mock.calls[0][3]).toMatchObject({expectedGoogleSyncVersion:record.googleSyncVersion});
});
it("local metadata includes explicit null expectation through the actual route",async()=>{
 m.list.mockResolvedValue([{...record,googleSyncVersion:null,googleSyncState:"local"}]);await controller.setTarget(target);m.update.mockResolvedValue({...record,status:"done",googleSyncVersion:null,googleSyncState:"local"});await controller.done(controller.state().appointments[0]);expect(m.update).toHaveBeenCalledWith(scope,id,{status:"done"},{clientMutationId:expect.any(String),expectedGoogleSyncVersion:null});
});

it("human conflict choice reaches actual strict route and keeps its original receipt after lost response",async()=>{m.list.mockResolvedValue([{...record,googleSyncState:"failed",googleSyncFailureCode:"ETAG_CONFLICT"}]);m.inspect.mockResolvedValue({canOverwrite:true});m.confirm.mockResolvedValue({...record,googleSyncState:"queued"});await controller.setTarget(target);await controller.checkConflict(controller.state().appointments[0]);const choice=controller.state().conflict!;expect(m.confirm).not.toHaveBeenCalled();expect(m.inspect).toHaveBeenCalledWith(scope,id,record.googleSyncVersion);lost="POST";expect(await controller.confirmConflict(choice)).toBeNull();expect(await controller.confirmConflict(choice)).toMatchObject({googleSyncState:"queued"});expect(m.confirm.mock.calls[0]).toEqual(m.confirm.mock.calls[1]);expect(m.confirm.mock.calls[0]).toEqual([scope,id,{clientMutationId:expect.any(String),expectedGoogleSyncVersion:record.googleSyncVersion,confirmOverwrite:true}]);});
it("actual conflict409 refresh preserves the frozen human choice instead of adopting a new version",async()=>{m.list.mockResolvedValue([{...record,googleSyncState:"failed",googleSyncFailureCode:"ETAG_CONFLICT"}]);m.inspect.mockResolvedValue({canOverwrite:true});m.confirm.mockRejectedValueOnce(Error("GOOGLE_EVENT_COMMAND_CONFLICT")).mockResolvedValue({...record,googleSyncState:"queued"});await controller.setTarget(target);await controller.checkConflict(controller.state().appointments[0]);const choice=controller.state().conflict!;m.list.mockResolvedValue([{...record,googleSyncVersion:"v1:9007199254740993:2:1"}]);await controller.confirmConflict(choice);expect(controller.state().conflict).toBe(choice);await controller.confirmConflict(choice);expect(m.confirm.mock.calls[0]).toEqual(m.confirm.mock.calls[1]);expect(m.confirm.mock.calls[1][2].expectedGoogleSyncVersion).toBe(record.googleSyncVersion);});
