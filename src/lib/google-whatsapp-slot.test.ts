import {afterEach,beforeEach,expect,it,vi} from "vitest";
import type {AIResult} from "./ai-processor";
import type {PendingSlotFill} from "./pending-actions";
const m=vi.hoisted(()=>({consumer:vi.fn(),save:vi.fn(),clear:vi.fn(),legacy:vi.fn(),reminder:vi.fn(),api:{listWorkspaceAppointments:vi.fn(),getWorkspaceAppointment:vi.fn(),getWorkspaceMeet:vi.fn(),createWorkspaceAppointment:vi.fn(),createWorkspaceMeet:vi.fn(),updateWorkspaceAppointment:vi.fn(),cancelWorkspaceAppointment:vi.fn(),addWorkspaceAppointmentMeet:vi.fn(),retryWorkspaceGoogleEvent:vi.fn()}}));
vi.mock("server-only",()=>({}));
vi.mock("./google-event-service",()=>m.api);
vi.mock("./pending-actions",async original=>({...await original<typeof import("./pending-actions")>(),setPendingAction:m.save,clearPendingAction:m.clear}));
vi.mock("./agenda",async original=>({...await original<typeof import("./agenda")>(),createAppointment:m.legacy}));
vi.mock("./reminders",async original=>({...await original<typeof import("./reminders")>(),createReminder:m.reminder}));
vi.mock("./google-whatsapp-service",()=>({loadGoogleWhatsAppConsumer:m.consumer}));
import {beginBatchSlotFill,beginSlotFill,runSlotFillTurn,type SlotCtx} from "./slot-filling";
import {runWithCompanyContext,setCompanyContext} from "./company-context";
import {googleWhatsAppMessageUUID} from "./google-whatsapp-message";
import {createGoogleWhatsAppConsumer} from "./google-whatsapp-consumer";
import type {GoogleWhatsAppIntent} from "./google-whatsapp-intent";
import type {GoogleWhatsAppReceipt} from "./google-whatsapp-commit";
const owner="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",company="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",phone="5511999999999";
const scope={userId:owner,companyId:company,mode:"business" as const};
const envelope={channel:"evolution" as const,providerMessageId:"fixture-agenda-original"};
const ctx={user:{locale:"pt-BR"},userId:owner,phone,mode:"business",googleMessage:envelope} as SlotCtx;
const ai=(data:Record<string,unknown>={})=>({intent:"agenda_create",confidence:1,agendaData:{title:"Fixture",startDate:"2026-10-20",startTime:"12:00",...data}} as AIResult);
const row=(id:string,data:Record<string,unknown>)=>({id,userId:owner,companyId:company,allDay:false,repeat:"none",status:"scheduled",source:"whatsapp",createdAt:"2026-10-14T12:00:00Z",...data,googleSyncVersion:null,googleSyncState:"local",googleSyncFailureCode:null,googleMeetPending:false,googleCancellationPending:false});
let saved:Record<string,unknown>|null;
const within=<T>(fn:()=>Promise<T>)=>runWithCompanyContext(async()=>{setCompanyContext(scope);return fn();});
beforeEach(()=>{vi.clearAllMocks();saved=null;vi.stubEnv("MULTI_COMPANY_ENABLED","true");vi.spyOn(Date,"now").mockReturnValue(Date.parse("2026-10-14T12:00:00Z"));m.consumer.mockResolvedValue(createGoogleWhatsAppConsumer(m.api));m.save.mockImplementation(async(_phone,data)=>{saved=structuredClone(data);});m.clear.mockImplementation(async()=>{saved=null;});m.api.createWorkspaceAppointment.mockImplementation(async(_scope,id,data)=>row(id,data));m.legacy.mockImplementation(async(data)=>row("cccccccc-cccc-4ccc-8ccc-ccccccccccc1",data));m.reminder.mockResolvedValue({id:"fixture-reminder"});});
afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();});
it("complete form commits the authenticated scoped identity before the service and keeps acknowledgement pending",()=>within(async()=>{
 const result=await beginSlotFill("agenda_create",ai(),ctx,"agende Fixture");expect(m.api.createWorkspaceAppointment).toHaveBeenCalledExactlyOnceWith(scope,googleWhatsAppMessageUUID(owner,envelope,0),expect.objectContaining({title:"Fixture",startAt:"2026-10-20T15:00:00.000Z"}),"whatsapp");
 expect(m.save.mock.invocationCallOrder[0]).toBeLessThan(m.api.createWorkspaceAppointment.mock.invocationCallOrder[0]);expect(saved).toMatchObject({type:"google_agenda_commit",receipts:[{recordId:googleWhatsAppMessageUUID(owner,envelope,0)}]});expect(m.clear).not.toHaveBeenCalled();expect(m.legacy).not.toHaveBeenCalled();expect(result.reply).toContain("Fixture");
}));
it("missing-field continuation retains the original message UUID despite a different reply envelope",()=>within(async()=>{
 await beginSlotFill("agenda_create",ai({startTime:undefined}),ctx,"agende Fixture");const pending=structuredClone(saved) as unknown as PendingSlotFill;expect(pending.missing).toEqual(["startTime"]);expect(m.api.createWorkspaceAppointment).not.toHaveBeenCalled();
 await runSlotFillTurn(pending,"14:30",{...ctx,googleMessage:{...envelope,providerMessageId:"fixture-followup"}} as SlotCtx);
 expect(m.api.createWorkspaceAppointment).toHaveBeenCalledWith(scope,googleWhatsAppMessageUUID(owner,envelope,0),expect.objectContaining({startAt:"2026-10-20T17:30:00.000Z"}),"whatsapp");expect(m.clear).not.toHaveBeenCalled();
}));
it("batch item ordinals reserve distinct stable IDs and a failed response resumes the same remaining item",()=>within(async()=>{
 m.api.createWorkspaceAppointment.mockImplementationOnce(async(_scope,id,data)=>row(id,data)).mockRejectedValueOnce(Error("GOOGLE_EVENT_STORAGE_UNAVAILABLE"));
 await expect(beginBatchSlotFill("agenda_create",[ai(),ai({title:"Second"})],ctx,"agende dois")).rejects.toThrow("GOOGLE_EVENT_STORAGE_UNAVAILABLE");
 const first=googleWhatsAppMessageUUID(owner,envelope,0),second=googleWhatsAppMessageUUID(owner,envelope,1);expect(first).not.toBe(second);expect(saved).toMatchObject({type:"google_agenda_commit",intents:[{clientMutationId:first},{clientMutationId:second}],receipts:[{clientMutationId:first,recordId:first}]});
 const original=m.api.createWorkspaceAppointment.mock.calls[1];m.api.getWorkspaceAppointment.mockResolvedValue(row(first,{title:"Fixture",startAt:"2026-10-20T15:00:00Z"}));
 await createGoogleWhatsAppConsumer(m.api).commit(owner,phone,saved!.intents as GoogleWhatsAppIntent[],saved!.receipts as GoogleWhatsAppReceipt[]);
 expect(m.api.createWorkspaceAppointment).toHaveBeenCalledTimes(3);expect(m.api.createWorkspaceAppointment.mock.calls[2]).toEqual(original);expect(m.api.getWorkspaceAppointment).toHaveBeenCalledWith(scope,first);expect(m.legacy).not.toHaveBeenCalled();
}));
it("question batch finalization commits all reserved original ordinals after collecting answers",()=>within(async()=>{
 await beginBatchSlotFill("agenda_create",[ai({startTime:undefined}),ai({title:"Second",startTime:undefined})],ctx,"dois compromissos");
 await runSlotFillTurn(structuredClone(saved) as unknown as PendingSlotFill,"13:00",ctx);expect(m.api.createWorkspaceAppointment).not.toHaveBeenCalled();
 await runSlotFillTurn(structuredClone(saved) as unknown as PendingSlotFill,"14:00",ctx);expect(m.api.createWorkspaceAppointment.mock.calls.map(call=>call[1])).toEqual([googleWhatsAppMessageUUID(owner,envelope,0),googleWhatsAppMessageUUID(owner,envelope,1)]);
}));
it("an old form cannot be silently re-targeted to another company or refreshed with a new ID",()=>within(async()=>{
 await beginSlotFill("agenda_create",ai({startTime:undefined}),ctx,"agende Fixture");const original=structuredClone(saved);setCompanyContext({...scope,companyId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2"});
 await expect(runSlotFillTurn(original as unknown as PendingSlotFill,"14:00",ctx)).rejects.toThrow("GOOGLE_WHATSAPP_WORKSPACE_CHANGED");expect(m.api.createWorkspaceAppointment).not.toHaveBeenCalled();expect(saved).toEqual(original);expect(m.legacy).not.toHaveBeenCalled();
}));
it("missing provider identity and historical forms fail closed instead of creating a random/global event",()=>within(async()=>{
 await expect(beginSlotFill("agenda_create",ai(),{...ctx,googleMessage:undefined} as SlotCtx,"agende")).rejects.toThrow("GOOGLE_WHATSAPP_MESSAGE_INVALID");expect(m.save).not.toHaveBeenCalled();
 const old={type:"slot_fill",userId:owner,intent:"agenda_create",draft:{title:"Old",startDate:"2026-10-20"},missing:["startTime"],asked:0,mode:"business",originalText:"old"} as PendingSlotFill;
 await expect(runSlotFillTurn(old,"14:00",ctx)).rejects.toThrow("GOOGLE_WHATSAPP_SELECTION_EXPIRED");expect(m.api.createWorkspaceAppointment).not.toHaveBeenCalled();expect(m.legacy).not.toHaveBeenCalled();
}));
it("model metadata cannot supply the reserved operation or workspace",()=>within(async()=>{
 await beginSlotFill("agenda_create",ai({_googleDraftIntent:{clientMutationId:"foreign"},clientMutationId:"foreign",companyId:"foreign",userId:"foreign"}),ctx,"agende");expect(m.api.createWorkspaceAppointment.mock.calls[0][1]).toBe(googleWhatsAppMessageUUID(owner,envelope,0));expect(m.api.createWorkspaceAppointment.mock.calls[0][2]).not.toHaveProperty("companyId");
}));
it("all-day/repeat and existing local reminder handling keep the established date format",()=>within(async()=>{
 const result=await beginSlotFill("agenda_create",ai({allDay:true,startTime:undefined,repeat:"weekly",reminderMinutesBefore:60}),ctx,"dia todo");expect(m.api.createWorkspaceAppointment).toHaveBeenCalledWith(scope,expect.any(String),expect.objectContaining({allDay:true,repeat:"weekly",startAt:"2026-10-20T03:00:00.000Z"}),"whatsapp");expect(m.reminder).toHaveBeenCalledWith(expect.objectContaining({mode:"business",scheduledAt:"2026-10-20T02:00:00.000Z"}));expect(result.reply).toContain("Vou avisar");
}));
it("the established all-day fallback also freezes the reserved form before an effect",()=>within(async()=>{
 await beginSlotFill("agenda_create",ai({startTime:undefined}),ctx,"agende");const pending={...structuredClone(saved),asked:2} as unknown as PendingSlotFill;
 const result=await runSlotFillTurn(pending,"??",ctx);expect(result).toMatchObject({googleCommit:true,fallThrough:false});expect(m.api.createWorkspaceAppointment).toHaveBeenCalledWith(scope,googleWhatsAppMessageUUID(owner,envelope,0),expect.objectContaining({allDay:true,startAt:"2026-10-20T03:00:00.000Z"}),"whatsapp");expect(m.clear).not.toHaveBeenCalled();
}));
it("concurrent first deliveries retain one logical identity without a new random ID",()=>within(async()=>{
 await Promise.all([beginSlotFill("agenda_create",ai(),ctx,"agende"),beginSlotFill("agenda_create",ai(),ctx,"agende")]);
 expect(m.api.createWorkspaceAppointment.mock.calls.map(call=>call[1])).toEqual([googleWhatsAppMessageUUID(owner,envelope,0),googleWhatsAppMessageUUID(owner,envelope,0)]);expect(m.legacy).not.toHaveBeenCalled();
}));
