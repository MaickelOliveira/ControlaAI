import {beforeEach,expect,it,vi} from "vitest";
const deps=vi.hoisted(()=>({save:vi.fn()}));
vi.mock("server-only",()=>({}));vi.mock("./pending-actions",()=>({setPendingAction:deps.save}));
import {runWithCompanyContext,setCompanyContext} from "./company-context";
import {prepareGoogleWhatsAppIntent} from "./google-whatsapp-intent";
import {createGoogleWhatsAppConsumer,googleWhatsAppConfirmation,googleWhatsAppReadyMeetLink} from "./google-whatsapp-consumer";
const owner="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",company="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",event="cccccccc-cccc-4ccc-8ccc-ccccccccccc1",mutation="dddddddd-dddd-4ddd-8ddd-ddddddddddd1";
const scope={userId:owner,companyId:company,mode:"business" as const},body={title:"Fixture",startAt:"2026-10-14T15:00:00Z",endAt:"2026-10-14T16:00:00Z"};
const fixture={id:event,userId:owner,...body,allDay:false,repeat:"none" as const,status:"scheduled" as const,source:"whatsapp" as const,createdAt:"2026-10-13T15:00:00Z",googleSyncVersion:"v1:9007199254740993:0:0",googleSyncState:"waiting" as const,googleSyncFailureCode:null,googleMeetPending:true,googleCancellationPending:false,meetLink:""};
const within=(next:()=>Promise<unknown>)=>runWithCompanyContext(async()=>{setCompanyContext(scope);return next();});
function services(){return {listWorkspaceAppointments:vi.fn(async()=>[fixture]),getWorkspaceAppointment:vi.fn(async()=>fixture),getWorkspaceMeet:vi.fn(async()=>({...fixture,calendarEventId:"",attendees:[],ataGenerated:false})),createWorkspaceAppointment:vi.fn(async()=>fixture),createWorkspaceMeet:vi.fn(async()=>({...fixture,calendarEventId:"",attendees:[],ataGenerated:false})),updateWorkspaceAppointment:vi.fn(async()=>fixture),cancelWorkspaceAppointment:vi.fn(async()=>fixture),addWorkspaceAppointmentMeet:vi.fn(async()=>fixture),retryWorkspaceGoogleEvent:vi.fn(async()=>fixture)};}
beforeEach(()=>{vi.clearAllMocks();deps.save.mockResolvedValue(undefined);});
it("dispatches creation only to the scoped service with the exact stable UUID and server source",async()=>{
 await within(async()=>{
  const api=services(),consumer=createGoogleWhatsAppConsumer(api),intent=prepareGoogleWhatsAppIntent(owner,"create_appointment",body,{clientMutationId:mutation});
  await consumer.commit(owner,"5511",[intent]);expect(api.createWorkspaceAppointment).toHaveBeenCalledExactlyOnceWith(scope,mutation,body,"whatsapp");expect(api.createWorkspaceMeet).not.toHaveBeenCalled();
  const meetIntent=prepareGoogleWhatsAppIntent(owner,"create_meet",body,{clientMutationId:mutation});await consumer.commit(owner,"5511",[meetIntent]);expect(api.createWorkspaceMeet).toHaveBeenCalledExactlyOnceWith(scope,mutation,body,"whatsapp");
 });
});
it.each(["update_appointment","cancel_appointment","add_meet","retry"] as const)("passes exact original revision and mutation identity for control %s",async operation=>{
 await within(async()=>{
  const api=services(),consumer=createGoogleWhatsAppConsumer(api),payload=operation==="update_appointment"?{title:"Changed"}:{},intent=prepareGoogleWhatsAppIntent(owner,operation,payload,{clientMutationId:mutation,appointmentId:event,expectedGoogleSyncVersion:fixture.googleSyncVersion});
  await consumer.commit(owner,"5511",[intent]);const target=operation==="update_appointment"?api.updateWorkspaceAppointment:operation==="cancel_appointment"?api.cancelWorkspaceAppointment:operation==="add_meet"?api.addWorkspaceAppointmentMeet:api.retryWorkspaceGoogleEvent;
  expect(target).toHaveBeenCalledExactlyOnceWith(scope,event,...(operation==="update_appointment"?[payload]:[]),{clientMutationId:mutation,expectedGoogleSyncVersion:fixture.googleSyncVersion});
 });
});
it("replays acknowledged creation with a scoped read and no creation or conference call",async()=>{
 await within(async()=>{
  const api=services(),consumer=createGoogleWhatsAppConsumer(api),intent=prepareGoogleWhatsAppIntent(owner,"create_meet",body,{clientMutationId:mutation});
  await consumer.commit(owner,"5511",[intent],[{clientMutationId:mutation,recordId:event}]);expect(api.getWorkspaceMeet).toHaveBeenCalledExactlyOnceWith(scope,event);expect(api.createWorkspaceMeet).not.toHaveBeenCalled();expect(api.createWorkspaceAppointment).not.toHaveBeenCalled();
 });
});
it("finds scheduled candidates only within one confirmed scoped read",async()=>{
 await within(async()=>{
  const api=services();api.listWorkspaceAppointments.mockResolvedValue([{...fixture,title:"Fixture other",status:"done"},{...fixture,title:"Fixture calendar",googleMeetPending:false},{...fixture,title:"Unrelated"}] as never);
  expect((await createGoogleWhatsAppConsumer(api).byKeyword(owner,"fixture")).map(row=>row.title)).toEqual(["Fixture calendar"]);expect(api.listWorkspaceAppointments).toHaveBeenCalledExactlyOnceWith(scope);
 });
});
it("preserves São Paulo range filtering while avoiding a global legacy reader",async()=>{
 await within(async()=>{
  const api=services();api.listWorkspaceAppointments.mockResolvedValue([{...fixture,startAt:"2026-10-14T02:59:59Z"},{...fixture,id:mutation,startAt:"2026-10-14T03:00:00Z"},{...fixture,id:owner,startAt:"2026-10-15T03:00:00Z"}]);
  const results=await createGoogleWhatsAppConsumer(api).inRange(owner,"2026-10-14","2026-10-14");expect(results.map(row=>row.id)).toEqual([mutation]);expect(api.listWorkspaceAppointments).toHaveBeenCalledExactlyOnceWith(scope);
 });
});
it("refuses to return a stale read after the participant workspace changes during an asynchronous lookup",async()=>{
 await within(async()=>{
  const api=services();api.listWorkspaceAppointments.mockImplementationOnce(async()=>{setCompanyContext({...scope,mode:"personal"});return [fixture];});await expect(createGoogleWhatsAppConsumer(api).byKeyword(owner,"fixture")).rejects.toThrow("GOOGLE_WHATSAPP_WORKSPACE_CHANGED");
 });
});
it.each(["pt-BR","pt-PT","es"])("shows a saved pending meeting without an empty link or invitation claim: %s",async locale=>{
 await within(async()=>{
  const intent=prepareGoogleWhatsAppIntent(owner,"create_meet",body),text=googleWhatsAppConfirmation(intent,fixture,locale);
  expect(text).toMatch(/preparando|preparar/i);expect(text).not.toContain("🔗");expect(text).not.toMatch(/convite.*enviado|Já avisei|Ya avisé/i);expect(googleWhatsAppReadyMeetLink(fixture)).toBeNull();
 });
});
it("shares a valid Meet link only after the service confirms success, never from pending/failed/legacy state",()=>{
 const ready={...fixture,googleMeetPending:false,googleSyncState:"succeeded" as const,meetLink:"https://meet.google.com/abc-defg-hij"};expect(googleWhatsAppReadyMeetLink(ready)).toBe(ready.meetLink);
 for(const record of [{...ready,googleSyncState:"failed" as const},{...ready,googleSyncState:"legacy" as const,googleSyncVersion:null},{...ready,googleSyncState:"waiting" as const},{...ready,googleMeetPending:true},{...ready,meetLink:"https://attacker.test/fake"}])expect(googleWhatsAppReadyMeetLink(record)).toBeNull();
 expect(googleWhatsAppReadyMeetLink({...ready,googleMeetPending:undefined} as never)).toBeNull();
});
it("explains pending cancellation without claiming the Google event was already removed",async()=>{
 await within(async()=>{const intent=prepareGoogleWhatsAppIntent(owner,"cancel_appointment",{}, {appointmentId:event,expectedGoogleSyncVersion:fixture.googleSyncVersion});const text=googleWhatsAppConfirmation(intent,{...fixture,status:"cancelled",googleCancellationPending:true},"pt-BR");expect(text).toContain("Cancelado na Zelo");expect(text).toContain("Google");expect(text).not.toMatch(/eliminei|removi|excluído/i);});
});
it("reports a service failure safely while confirming the local record remains in Agenda",async()=>{
 await within(async()=>{const intent=prepareGoogleWhatsAppIntent(owner,"create_meet",body),text=googleWhatsAppConfirmation(intent,{...fixture,googleSyncState:"failed",googleSyncFailureCode:"TEMPORARY"},"pt-BR");expect(text).toContain("Agenda");expect(text).toContain("tentar novamente");expect(text).not.toContain("TEMPORARY");expect(text).not.toMatch(/Preparando/);});
});
