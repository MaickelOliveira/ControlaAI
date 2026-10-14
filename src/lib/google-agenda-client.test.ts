import {beforeEach,expect,it,vi} from "vitest";
import {createGoogleAgendaController} from "./google-agenda-client";
const target={mode:"personal" as const,companyId:null,workspaceKey:"a".repeat(64),label:"Pessoal"};
const record={id:"11111111-1111-4111-8111-111111111111",title:"Fixture",startAt:"2026-10-14T12:00:00Z",allDay:false,repeat:"none",status:"scheduled",source:"web",createdAt:"2026-10-13T12:00:00Z",googleSyncVersion:"v1:1:0:0",googleSyncState:"waiting",googleSyncFailureCode:null,googleMeetPending:true,googleCancellationPending:false,meetLink:""};
function reply(value:unknown,init:ResponseInit={}){return Response.json(value,{...init,headers:{"X-Zelo-Workspace-Key":target.workspaceKey,...Object.fromEntries(new Headers(init.headers))}});}
const body={title:"Fixture",startAt:record.startAt,allDay:false,repeat:"none",withMeet:true};
let fetcher:ReturnType<typeof vi.fn<(url:string,init?:RequestInit)=>Promise<Response>>>,controller:ReturnType<typeof createGoogleAgendaController>;
beforeEach(()=>{fetcher=vi.fn<(url:string,init?:RequestInit)=>Promise<Response>>().mockImplementation(async url=>reply(url==="/api/google/status"?{workspace:target,connected:true}:[record]));let sequence=0;controller=createGoogleAgendaController({fetch:fetcher,uuid:()=>`00000000-0000-4000-8000-${String(++sequence).padStart(12,"0")}`,changed:()=>{}});});
it("preserves an exact POST intent after a lost response and upserts its confirmation",async()=>{
 await controller.setTarget(target);const id=controller.newIntent();fetcher.mockRejectedValueOnce(Error("fixture lost response"));expect(await controller.create(id,body)).toBeNull();
 fetcher.mockResolvedValueOnce(reply(record,{status:201}));expect((await controller.create(id,body))?.id).toBe(record.id);
 const calls=fetcher.mock.calls.filter(([,init])=>init?.method==="POST");expect(calls).toHaveLength(2);expect(calls[0][1]!.body).toBe(calls[1][1]!.body);expect(controller.state().appointments).toHaveLength(1);
});
it("refuses edits to an attempted immutable intent instead of silently replacing its UUID",async()=>{
 await controller.setTarget(target);const id=controller.newIntent();fetcher.mockRejectedValueOnce(Error("fixture timeout"));await controller.create(id,body);
 await controller.create(id,{...body,title:"Changed"});expect(controller.state().errorCode).toBe("AGENDA_INTENT_CHANGED");expect(fetcher.mock.calls.filter(([,init])=>init?.method==="POST")).toHaveLength(1);
});
it("sends exact control versions and stable request UUIDs and omits withMeet from edit",async()=>{
 await controller.setTarget(target);fetcher.mockResolvedValueOnce(reply({...record,title:"Changed",googleSyncVersion:"v1:1:1:0"}));
 await controller.patch(controller.newIntent(),controller.state().appointments[0],{title:"Changed",withMeet:false});
 const init=fetcher.mock.calls.find(([,init])=>init?.method==="PATCH")![1]!;expect(JSON.parse(init.body as string)).toMatchObject({expectedGoogleSyncVersion:"v1:1:0:0",clientMutationId:expect.any(String),title:"Changed"});expect(JSON.parse(init.body as string)).not.toHaveProperty("withMeet");expect(JSON.parse(init.body as string)).not.toHaveProperty("googleSyncVersion");
});
it("keeps completion local while sending the required original expectation and stable identity",async()=>{
 await controller.setTarget(target);fetcher.mockResolvedValueOnce(reply({...record,status:"done"}));await controller.done(controller.state().appointments[0]);
 const init=fetcher.mock.calls.find(([,init])=>init?.method==="PATCH")![1]!;expect(JSON.parse(init.body as string)).toEqual({status:"done",expectedGoogleSyncVersion:record.googleSyncVersion,clientMutationId:expect.any(String)});
});
it("reloads on conflict but retains the intent and never upgrades its expected version",async()=>{
 await controller.setTarget(target);const id=controller.newIntent();fetcher.mockResolvedValueOnce(reply({code:"GOOGLE_EVENT_ATTEMPT_CONFLICT"},{status:409}));
 await controller.patch(id,controller.state().appointments[0],{title:"Changed"});expect(controller.state().errorCode).toBe("AGENDA_CONFLICT");
 fetcher.mockResolvedValueOnce(reply({...record,title:"Changed"}));await controller.patch(id,record as never,{title:"Changed"});
 const calls=fetcher.mock.calls.filter(([,init])=>init?.method==="PATCH");expect(calls[0][1]!.body).toBe(calls[1][1]!.body);
});
it("retains cancelled pending work for explicit retry",async()=>{
 await controller.setTarget(target);fetcher.mockResolvedValueOnce(reply({...record,status:"cancelled",googleCancellationPending:true,googleSyncState:"queued"}));await controller.remove(controller.state().appointments[0]);
 expect(controller.state().appointments[0].googleCancellationPending).toBe(true);fetcher.mockResolvedValueOnce(reply({...record,status:"cancelled",googleCancellationPending:false,googleSyncState:"succeeded"}));await controller.retry(controller.state().appointments[0]);
 expect(fetcher.mock.calls.at(-1)?.[0]).toBe(`/api/agenda/${record.id}/retry`);expect(controller.state().appointments).toEqual([]);
});
it("discards delayed mutation success and finally after changing owner/workspace",async()=>{
 await controller.setTarget(target);let finish!:(response:Response)=>void;fetcher.mockReturnValueOnce(new Promise(resolve=>{finish=resolve;}));const pending=controller.create(controller.newIntent(),body);await controller.setTarget(null);
 finish(reply(record,{status:201}));await pending;expect(controller.state()).toMatchObject({target:null,appointments:[],busy:false,errorCode:null});
});
it("hides raw errors and clears all data after an expired session",async()=>{
 await controller.setTarget(target);fetcher.mockResolvedValueOnce(reply({error:"private fixture error"},{status:401}));await controller.remove(controller.state().appointments[0]);expect(controller.state()).toMatchObject({target:null,appointments:[],errorCode:"AGENDA_AUTH_REQUIRED"});
});
it("sends the immutable SSR correlation key even for metadata and rejects another tab's successful response before decoding it",async()=>{
 await controller.setTarget(target);expect(fetcher.mock.calls.every(([,init])=>new Headers(init?.headers).get("X-Zelo-Workspace-Key")===target.workspaceKey)).toBe(true);
 const wrong=reply([record],{headers:{"X-Zelo-Workspace-Key":"b".repeat(64)}}),decode=vi.spyOn(wrong,"json");fetcher.mockResolvedValueOnce(wrong);await controller.reload();
 expect(decode).not.toHaveBeenCalled();expect(controller.state()).toMatchObject({target,appointments:[],googleConnected:false,errorCode:"AGENDA_WORKSPACE_CHANGED"});
});
it("keeps an attempted intent after a wrong-space rejection without adopting the returned key",async()=>{
 await controller.setTarget(target);const id=controller.newIntent();fetcher.mockRejectedValueOnce(Error("fixture lost acknowledgement"));await controller.create(id,body);
 fetcher.mockResolvedValueOnce(reply([record],{headers:{"X-Zelo-Workspace-Key":"b".repeat(64)}}));await controller.reload();const count=fetcher.mock.calls.length;await controller.create(id,body);expect(fetcher.mock.calls).toHaveLength(count);
 await controller.reload();fetcher.mockResolvedValueOnce(reply(record,{status:201}));await controller.create(id,body);
 const calls=fetcher.mock.calls.filter(([,init])=>init?.method==="POST");expect(calls).toHaveLength(2);expect(calls[0][1]!.body).toBe(calls[1][1]!.body);expect(new Headers(calls[1][1]!.headers).get("X-Zelo-Workspace-Key")).toBe(target.workspaceKey);
});
it("completion preserves its UUID and expected snapshot after an ambiguous response",async()=>{
 await controller.setTarget(target);fetcher.mockRejectedValueOnce(Error("fixture lost response"));await controller.done(controller.state().appointments[0]);fetcher.mockResolvedValueOnce(reply({...record,status:"done"}));await controller.done(controller.state().appointments[0]);
 const calls=fetcher.mock.calls.filter(([,init])=>init?.method==="PATCH");expect(calls).toHaveLength(2);expect(calls[0][1]!.body).toBe(calls[1][1]!.body);expect(JSON.parse(calls[0][1]!.body as string)).toMatchObject({expectedGoogleSyncVersion:record.googleSyncVersion,clientMutationId:expect.any(String)});
});
