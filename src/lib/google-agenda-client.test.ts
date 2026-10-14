import {beforeEach,expect,it,vi} from "vitest";
import {createGoogleAgendaController} from "./google-agenda-client";
const target={mode:"personal" as const,companyId:null,workspaceKey:"a".repeat(64),label:"Pessoal"};
const record={id:"11111111-1111-4111-8111-111111111111",title:"Fixture",startAt:"2026-10-14T12:00:00Z",allDay:false,repeat:"none",status:"scheduled",source:"web",createdAt:"2026-10-13T12:00:00Z",googleSyncVersion:"v1:1:0:0",googleSyncState:"waiting",googleSyncFailureCode:null,googleMeetPending:true,googleCancellationPending:false,meetLink:""};
const body={title:"Fixture",startAt:record.startAt,allDay:false,repeat:"none",withMeet:true};
let fetcher:ReturnType<typeof vi.fn<(url:string,init?:RequestInit)=>Promise<Response>>>,controller:ReturnType<typeof createGoogleAgendaController>;
beforeEach(()=>{fetcher=vi.fn<(url:string,init?:RequestInit)=>Promise<Response>>().mockImplementation(async url=>Response.json(url==="/api/google/status"?{workspace:target,connected:true}:[record]));let sequence=0;controller=createGoogleAgendaController({fetch:fetcher,uuid:()=>`00000000-0000-4000-8000-${String(++sequence).padStart(12,"0")}`,changed:()=>{}});});
it("preserves an exact POST intent after a lost response and upserts its confirmation",async()=>{
 await controller.setTarget(target);const id=controller.newIntent();fetcher.mockRejectedValueOnce(Error("fixture lost response"));expect(await controller.create(id,body)).toBeNull();
 fetcher.mockResolvedValueOnce(Response.json(record,{status:201}));expect((await controller.create(id,body))?.id).toBe(record.id);
 const calls=fetcher.mock.calls.filter(([,init])=>init?.method==="POST");expect(calls).toHaveLength(2);expect(calls[0][1]!.body).toBe(calls[1][1]!.body);expect(controller.state().appointments).toHaveLength(1);
});
it("refuses edits to an attempted immutable intent instead of silently replacing its UUID",async()=>{
 await controller.setTarget(target);const id=controller.newIntent();fetcher.mockRejectedValueOnce(Error("fixture timeout"));await controller.create(id,body);
 await controller.create(id,{...body,title:"Changed"});expect(controller.state().errorCode).toBe("AGENDA_INTENT_CHANGED");expect(fetcher.mock.calls.filter(([,init])=>init?.method==="POST")).toHaveLength(1);
});
it("sends exact control versions and stable request UUIDs and omits withMeet from edit",async()=>{
 await controller.setTarget(target);fetcher.mockResolvedValueOnce(Response.json({...record,title:"Changed",googleSyncVersion:"v1:1:1:0"}));
 await controller.patch(controller.newIntent(),controller.state().appointments[0],{title:"Changed",withMeet:false});
 const init=fetcher.mock.calls.find(([,init])=>init?.method==="PATCH")![1]!;expect(JSON.parse(init.body as string)).toMatchObject({googleSyncVersion:"v1:1:0:0",clientMutationId:expect.any(String),title:"Changed"});expect(JSON.parse(init.body as string)).not.toHaveProperty("withMeet");
});
it("keeps completion local and sends no Google version or request identity",async()=>{
 await controller.setTarget(target);fetcher.mockResolvedValueOnce(Response.json({...record,status:"done"}));await controller.done(controller.state().appointments[0]);
 const init=fetcher.mock.calls.find(([,init])=>init?.method==="PATCH")![1]!;expect(JSON.parse(init.body as string)).toEqual({status:"done"});
});
it("reloads on conflict but retains the intent and never upgrades its expected version",async()=>{
 await controller.setTarget(target);const id=controller.newIntent();fetcher.mockResolvedValueOnce(Response.json({code:"GOOGLE_EVENT_ATTEMPT_CONFLICT"},{status:409}));
 await controller.patch(id,controller.state().appointments[0],{title:"Changed"});expect(controller.state().errorCode).toBe("AGENDA_CONFLICT");
 fetcher.mockResolvedValueOnce(Response.json({...record,title:"Changed"}));await controller.patch(id,record as never,{title:"Changed"});
 const calls=fetcher.mock.calls.filter(([,init])=>init?.method==="PATCH");expect(calls[0][1]!.body).toBe(calls[1][1]!.body);
});
it("retains cancelled pending work for explicit retry",async()=>{
 await controller.setTarget(target);fetcher.mockResolvedValueOnce(Response.json({...record,status:"cancelled",googleCancellationPending:true,googleSyncState:"queued"}));await controller.remove(controller.state().appointments[0]);
 expect(controller.state().appointments[0].googleCancellationPending).toBe(true);fetcher.mockResolvedValueOnce(Response.json({...record,status:"cancelled",googleCancellationPending:false,googleSyncState:"succeeded"}));await controller.retry(controller.state().appointments[0]);
 expect(fetcher.mock.calls.at(-1)?.[0]).toBe(`/api/agenda/${record.id}/google-retry`);expect(controller.state().appointments).toEqual([]);
});
it("discards delayed mutation success and finally after changing owner/workspace",async()=>{
 await controller.setTarget(target);let finish!:(response:Response)=>void;fetcher.mockReturnValueOnce(new Promise(resolve=>{finish=resolve;}));const pending=controller.create(controller.newIntent(),body);await controller.setTarget(null);
 finish(Response.json(record,{status:201}));await pending;expect(controller.state()).toMatchObject({target:null,appointments:[],busy:false,errorCode:null});
});
it("hides raw errors and clears all data after an expired session",async()=>{
 await controller.setTarget(target);fetcher.mockResolvedValueOnce(Response.json({error:"private fixture error"},{status:401}));await controller.remove(controller.state().appointments[0]);expect(controller.state()).toMatchObject({target:null,appointments:[],errorCode:"AGENDA_AUTH_REQUIRED"});
});
