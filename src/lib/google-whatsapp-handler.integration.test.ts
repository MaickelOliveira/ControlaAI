import {afterEach,beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({owner:vi.fn(),send:vi.fn(),process:vi.fn(),pending:vi.fn(),save:vi.fn(),clear:vi.fn(),connected:vi.fn(),settings:vi.fn(),legacy:vi.fn(),global:vi.fn(),globalMeet:vi.fn(),confirmed:true,scope:{userId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",companyId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",mode:"business" as "personal"|"business"},api:{listWorkspaceAppointments:vi.fn(),getWorkspaceAppointment:vi.fn(),getWorkspaceMeet:vi.fn(),createWorkspaceAppointment:vi.fn(),createWorkspaceMeet:vi.fn(),updateWorkspaceAppointment:vi.fn(),cancelWorkspaceAppointment:vi.fn(),addWorkspaceAppointmentMeet:vi.fn(),retryWorkspaceGoogleEvent:vi.fn()}}));
vi.mock("server-only",()=>({}));
vi.mock("./google-event-service",()=>m.api);
vi.mock("./google-whatsapp-service",()=>({loadGoogleWhatsAppConnected:m.connected,loadGoogleWhatsAppConsumer:async()=>{const {createGoogleWhatsAppConsumer}=await import("./google-whatsapp-consumer");return createGoogleWhatsAppConsumer(m.api);}}));
vi.mock("./google-settings-service",async original=>({...await original<typeof import("./google-settings-service")>(),loadGoogleSettings:m.settings}));
vi.mock("./users",async original=>({...await original<typeof import("./users")>(),getUserById:m.owner}));
vi.mock("./wpp-phone-links",()=>({getUserIdByPhone:async()=>m.scope.userId,getPhoneAccess:async()=>"both",getPhonesForUser:async()=>[{phone:"5511999999999",name:"Fixture",relation:"Titular"}]}));
vi.mock("./whatsapp-company",()=>({contextualCompanyUser:(user:Record<string,unknown>)=>({...user,activeMode:m.scope.mode}),withWhatsAppCompany:async(message:unknown,next:(message:unknown)=>Promise<void>)=>{const {runWithCompanyContext,setCompanyContext}=await import("./company-context");return runWithCompanyContext(async()=>{if(m.confirmed)setCompanyContext({...m.scope,companyName:"Fixture company"});await next(message);});},switchPhoneCompanyMode:vi.fn()}));
vi.mock("./pending-actions",async original=>({...await original<typeof import("./pending-actions")>(),getPendingAction:m.pending,setPendingAction:m.save,clearPendingAction:m.clear}));
vi.mock("./conversations",async original=>({...await original<typeof import("./conversations")>(),addMessage:vi.fn(),getAiPaused:async()=>false,getAiHistory:async()=>[]}));
vi.mock("./whatsapp",()=>({sendText:m.send,sendFile:vi.fn()}));vi.mock("./whatsapp-config",()=>({getConfig:async()=>({})}));
vi.mock("./ai-processor",async original=>({...await original<typeof import("./ai-processor")>(),processMessage:m.process}));
vi.mock("./rate-limit",()=>({checkRateLimit:async()=>true}));
vi.mock("./agenda",async original=>({...await original<typeof import("./agenda")>(),createAppointment:m.legacy,updateAppointment:m.legacy,deleteAppointment:m.legacy,findAppointmentsByKeyword:m.legacy,getAppointmentById:m.legacy,getUpcomingAppointments:m.legacy,getAppointmentsInRange:m.legacy}));
vi.mock("./google-oauth",async original=>({...await original<typeof import("./google-oauth")>(),isConnected:m.global}));
vi.mock("./google-meet",()=>({createMeetEvent:m.globalMeet}));
vi.mock("./google-calendar",async original=>({...await original<typeof import("./google-calendar")>(),addMeetToGoogleCalendarEvent:m.globalMeet}));
import {handleIncomingMessage} from "./message-handler";
import {runWithCompanyContext,setCompanyContext} from "./company-context";
import {googleWhatsAppMessageUUID} from "./google-whatsapp-message";
const owner=m.scope.userId,company=m.scope.companyId,event="cccccccc-cccc-4ccc-8ccc-ccccccccccc1",phone="5511999999999";
const record={id:event,userId:owner,companyId:company,title:"Fixture",startAt:"2026-10-14T15:00:00Z",endAt:"2026-10-14T16:00:00Z",allDay:false,repeat:"none",status:"scheduled",source:"whatsapp",createdAt:"2026-10-13T15:00:00Z",googleSyncVersion:"v1:9007199254740993:0:0",googleSyncState:"waiting",googleSyncFailureCode:null,googleMeetPending:true,googleCancellationPending:false,meetLink:""};
let saved:Record<string,unknown>|null;
const receive=(text:string,id="fixture-original")=>handleIncomingMessage({from:phone,text,channel:"evolution",providerMessageId:id});
const reply=()=>m.send.mock.calls.map(call=>call[1]).join("\n");
async function mutationId(id="fixture-original"){return runWithCompanyContext(async()=>{setCompanyContext(m.scope);return googleWhatsAppMessageUUID(owner,{channel:"evolution",providerMessageId:id},0);});}
beforeEach(()=>{
 vi.clearAllMocks();vi.stubEnv("MULTI_COMPANY_ENABLED","true");vi.stubEnv("OPEN_FINANCE_WHATSAPP_ENABLED","false");saved=null;m.confirmed=true;m.scope.mode="business";m.scope.companyId=company;
 m.owner.mockResolvedValue({id:owner,name:"Fixture",phone,email:"fixture@example.test",plan:"business",status:"active",activeMode:"personal",locale:"pt-BR"});m.send.mockResolvedValue(true);m.pending.mockImplementation(async()=>saved);m.save.mockImplementation(async(_phone,data)=>{saved=JSON.parse(JSON.stringify(data));});m.clear.mockImplementation(async()=>{saved=null;});
 m.process.mockResolvedValue({intent:"agenda_update",confidence:.99,keyword:"Fixture",mode:"personal",agendaData:{title:"Changed"}});
 m.api.listWorkspaceAppointments.mockResolvedValue([record]);m.api.getWorkspaceAppointment.mockResolvedValue(record);m.api.getWorkspaceMeet.mockResolvedValue(record);m.api.updateWorkspaceAppointment.mockResolvedValue({...record,title:"Changed"});m.api.cancelWorkspaceAppointment.mockResolvedValue({...record,status:"cancelled",googleCancellationPending:true});m.api.addWorkspaceAppointmentMeet.mockResolvedValue(record);m.api.retryWorkspaceGoogleEvent.mockResolvedValue(record);
 m.connected.mockResolvedValue(true);m.api.createWorkspaceAppointment.mockImplementation(async(_scope,id,data)=>({...record,...data,id,googleSyncVersion:null,googleSyncState:"local",googleMeetPending:false}));m.api.createWorkspaceMeet.mockImplementation(async(_scope,id,data)=>({...record,...data,id}));
 m.settings.mockResolvedValue({connected:true});
 m.legacy.mockResolvedValue([record]);m.global.mockResolvedValue(true);m.globalMeet.mockResolvedValue({meetLink:"https://meet.google.com/abc-defg-hij",calendarEventId:"foreign-legacy",googleCalendarId:"primary"});vi.spyOn(console,"error").mockImplementation(()=>{});vi.spyOn(console,"log").mockImplementation(()=>{});
});
afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();});
it("actual handler updates in the confirmed company, ignoring model/global mode and legacy Google",async()=>{
 await receive("altere o título Fixture para Changed");expect(m.api.listWorkspaceAppointments).toHaveBeenCalledWith(m.scope);expect(m.api.updateWorkspaceAppointment).toHaveBeenCalledExactlyOnceWith(m.scope,event,{title:"Changed"},{clientMutationId:await mutationId(),expectedGoogleSyncVersion:record.googleSyncVersion});
 expect(m.legacy).not.toHaveBeenCalled();expect(m.global).not.toHaveBeenCalled();expect(m.globalMeet).not.toHaveBeenCalled();expect(reply()).toContain("Changed");expect(saved).toBeNull();
});
it("actual cancellation acknowledges Zelo separately from a Google cancellation still pending",async()=>{
 m.process.mockResolvedValue({intent:"agenda_delete",confidence:.99,keyword:"Fixture"});await receive("cancele o compromisso Fixture");expect(m.api.cancelWorkspaceAppointment).toHaveBeenCalledWith(m.scope,event,{clientMutationId:await mutationId(),expectedGoogleSyncVersion:record.googleSyncVersion});expect(reply()).toContain("Cancelado na Zelo");expect(reply()).toContain("ainda precisa ser concluído");expect(m.legacy).not.toHaveBeenCalled();
});
it("metadata completion uses only the scoped service and never a Google OAuth/provider helper",async()=>{
 m.process.mockResolvedValue({intent:"agenda_done",confidence:.99,keyword:"Fixture"});await receive("marque Fixture como realizado");expect(m.api.updateWorkspaceAppointment).toHaveBeenCalledWith(m.scope,event,{status:"done"},expect.objectContaining({expectedGoogleSyncVersion:record.googleSyncVersion}));expect(m.global).not.toHaveBeenCalled();expect(m.globalMeet).not.toHaveBeenCalled();expect(m.legacy).not.toHaveBeenCalled();expect(reply()).toContain("Marquei como realizado");
});
it("add Meet uses owned original conference command and describes pending link without a new global creation",async()=>{
 m.process.mockResolvedValue({intent:"agenda_add_meet",confidence:.99,keyword:"Fixture"});await receive("adicione Meet no compromisso Fixture");expect(m.api.addWorkspaceAppointmentMeet).toHaveBeenCalledWith(m.scope,event,{clientMutationId:await mutationId(),expectedGoogleSyncVersion:record.googleSyncVersion});expect(m.api.createWorkspaceMeet).not.toHaveBeenCalled();expect(m.globalMeet).not.toHaveBeenCalled();expect(m.global).not.toHaveBeenCalled();expect(reply()).toContain("Preparando link");expect(reply()).not.toContain("https://");
});
it("selection retains the version originally shown even when a later read has changed",async()=>{
 saved={type:"appointment_selection",userId:owner,action:"update",awaitingPatch:true,appointments:[{id:event,title:"Fixture",startAt:record.startAt,googleSyncVersion:"v1:1:0:0"}],workspaceMode:"business",companyId:company};
 m.api.getWorkspaceAppointment.mockResolvedValue({...record,googleSyncVersion:"v1:2:0:0"});m.api.updateWorkspaceAppointment.mockRejectedValueOnce(Error("GOOGLE_EVENT_COMMAND_CONFLICT"));await receive("altere o título para Changed");
 expect(m.api.updateWorkspaceAppointment).toHaveBeenCalledWith(m.scope,event,{title:"Changed"},expect.objectContaining({expectedGoogleSyncVersion:"v1:1:0:0"}));expect(saved).toMatchObject({type:"google_agenda_commit",intents:[{expectedGoogleSyncVersion:"v1:1:0:0"}]});expect(m.legacy).not.toHaveBeenCalled();
});
it("ambiguous service failure keeps one exact intent and explicit retry reuses it despite a new inbound message",async()=>{
 m.api.updateWorkspaceAppointment.mockRejectedValueOnce(Error("GOOGLE_EVENT_STORAGE_UNAVAILABLE"));await receive("altere o título Fixture para Changed");const first=m.api.updateWorkspaceAppointment.mock.calls[0];expect(saved).toMatchObject({type:"google_agenda_commit",receipts:[]});
 await receive("tentar novamente","fixture-followup");expect(m.api.updateWorkspaceAppointment).toHaveBeenCalledTimes(2);expect(m.api.updateWorkspaceAppointment.mock.calls[1]).toEqual(first);expect(saved).toBeNull();
});
it("does not retry Google work merely because a pending user asks an unrelated explanation",async()=>{
 m.api.updateWorkspaceAppointment.mockRejectedValueOnce(Error("GOOGLE_EVENT_STORAGE_UNAVAILABLE"));await receive("altere o título Fixture para Changed");await receive("não entendi o que aconteceu","fixture-followup");expect(m.api.updateWorkspaceAppointment).toHaveBeenCalledTimes(1);expect(saved).toMatchObject({type:"google_agenda_commit"});expect(reply()).toContain("tentar novamente");
});
it("missing confirmed participant context stops reads and effects even if global Google is connected",async()=>{
 m.confirmed=false;await receive("altere o título Fixture para Changed");expect(m.api.listWorkspaceAppointments).not.toHaveBeenCalled();expect(m.api.updateWorkspaceAppointment).not.toHaveBeenCalled();expect(m.global).not.toHaveBeenCalled();expect(m.legacy).not.toHaveBeenCalled();
});
it("old selection without a sync snapshot is cleared without guessing legacy authority or creating an intent",async()=>{
 saved={type:"appointment_selection",userId:owner,action:"delete",appointments:[{id:event,title:"Fixture",startAt:record.startAt}]};await receive("1");
 expect(m.api.cancelWorkspaceAppointment).not.toHaveBeenCalled();expect(m.save).not.toHaveBeenCalled();expect(saved).toBeNull();expect(reply()).toContain("escolha é antiga");
});
it("a missing authenticated provider identity never becomes a new random Google operation",async()=>{
 await handleIncomingMessage({from:phone,text:"altere o título Fixture para Changed"});expect(m.api.updateWorkspaceAppointment).not.toHaveBeenCalled();expect(m.save).not.toHaveBeenCalled();expect(reply()).toContain("identificação válida");
});
const meetAi=()=>({intent:"meet_create",confidence:.99,meetData:{title:"Fixture meeting",startDate:"2026-10-14",startTime:"12:00",duration:60,attendees:[{name:"Fixture guest",phone:"5511999990001"}]}});
it("new meeting confirmation freezes the original scoped UUID and pending link never becomes an invitation",async()=>{
 m.process.mockResolvedValue(meetAi());await receive("reunião Fixture amanhã às12","fixture-meeting-original");expect(saved).toMatchObject({type:"meet_confirm",withMeetAvailable:true,googleDrafts:[{clientMutationId:await mutationId("fixture-meeting-original"),workspace:m.scope}]});expect(m.api.createWorkspaceMeet).not.toHaveBeenCalled();
 await receive("sim","fixture-meeting-confirmation");expect(m.api.createWorkspaceMeet).toHaveBeenCalledWith(m.scope,await mutationId("fixture-meeting-original"),expect.objectContaining({title:"Fixture meeting"}),"whatsapp");expect(reply()).toContain("Preparando link");expect(m.send.mock.calls.every(call=>call[0]===phone)).toBe(true);expect(m.global).not.toHaveBeenCalled();expect(m.globalMeet).not.toHaveBeenCalled();expect(m.legacy).not.toHaveBeenCalled();
});
it("scoped connection absence asks for local-only consent despite a connected legacy global account",async()=>{
 m.connected.mockResolvedValue(false);m.process.mockResolvedValue(meetAi());await receive("reunião Fixture amanhã às12","fixture-local-meeting");expect(saved).toMatchObject({type:"meet_confirm",withMeetAvailable:false});expect(m.api.createWorkspaceAppointment).not.toHaveBeenCalled();expect(reply()).toContain("sem link");
 await receive("sim","fixture-local-consent");expect(m.api.createWorkspaceAppointment).toHaveBeenCalledWith(m.scope,await mutationId("fixture-local-meeting"),expect.objectContaining({withMeet:false}),"whatsapp");expect(m.api.createWorkspaceMeet).not.toHaveBeenCalled();expect(m.global).not.toHaveBeenCalled();expect(m.legacy).not.toHaveBeenCalled();
});
it("declining local-only creation creates nothing and old questions without frozen intents cannot activate legacy Google",async()=>{
 m.connected.mockResolvedValue(false);m.process.mockResolvedValue(meetAi());await receive("reunião Fixture amanhã às12");await receive("não");expect(m.api.createWorkspaceAppointment).not.toHaveBeenCalled();expect(m.api.createWorkspaceMeet).not.toHaveBeenCalled();
 saved={type:"meet_confirm",userId:owner,title:"Old",startAt:record.startAt,endAt:record.endAt,attendees:[],mode:"business"};await receive("sim");expect(m.api.createWorkspaceMeet).not.toHaveBeenCalled();expect(m.global).not.toHaveBeenCalled();expect(saved).toBeNull();
});
it("a confirmed meeting sends only a ready valid link and a replay never resends the invitation",async()=>{
 m.process.mockResolvedValue(meetAi());m.api.createWorkspaceMeet.mockImplementation(async(_scope,id,data)=>({...record,...data,id,googleSyncState:"succeeded",googleMeetPending:false,meetLink:"https://meet.google.com/abc-defg-hij"}));
 await receive("reunião Fixture amanhã às12","fixture-ready-meeting");await receive("sim","fixture-ready-confirmation");const guestCalls=m.send.mock.calls.filter(call=>call[0]==="5511999990001");expect(guestCalls).toHaveLength(1);expect(guestCalls[0][1]).toContain("https://meet.google.com/abc-defg-hij");
 const commit=m.save.mock.calls.findLast(call=>call[1].type==="google_agenda_commit")![1];saved=JSON.parse(JSON.stringify(commit));m.api.getWorkspaceMeet.mockResolvedValue({...record,id:commit.receipts[0].recordId,googleSyncState:"succeeded",googleMeetPending:false,meetLink:"https://meet.google.com/abc-defg-hij"});await receive("tentar novamente","fixture-retry-confirmation");expect(m.send.mock.calls.filter(call=>call[0]==="5511999990001")).toHaveLength(1);expect(m.api.createWorkspaceMeet).toHaveBeenCalledOnce();
});
it("a pending meeting cannot be re-targeted after company change even if the handler is called with stale storage",async()=>{
 m.process.mockResolvedValue(meetAi());await receive("reunião Fixture amanhã às12");m.scope.companyId="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";await receive("sim");expect(m.api.createWorkspaceMeet).not.toHaveBeenCalled();expect(m.api.createWorkspaceAppointment).not.toHaveBeenCalled();expect(reply()).toContain("espaço do pedido mudou");
});
it("actual connection wiring consults private scoped settings without provider/global probes and rechecks after the read",async()=>{
 const real=await vi.importActual<typeof import("./google-whatsapp-service")>("./google-whatsapp-service");
 await runWithCompanyContext(async()=>{setCompanyContext(m.scope);expect(await real.loadGoogleWhatsAppConnected(owner)).toBe(true);expect(m.settings).toHaveBeenCalledWith(m.scope);m.settings.mockImplementationOnce(async()=>{setCompanyContext({...m.scope,mode:"personal"});return {connected:true};});await expect(real.loadGoogleWhatsAppConnected(owner)).rejects.toThrow("GOOGLE_WHATSAPP_WORKSPACE_CHANGED");});
 expect(m.global).not.toHaveBeenCalled();expect(m.globalMeet).not.toHaveBeenCalled();
});
it("actual Agenda creation passes the authenticated source identity and acknowledges before clearing",async()=>{
 m.process.mockResolvedValue({intent:"agenda_create",confidence:.99,agendaData:{title:"Fixture create",startDate:"2026-10-20",startTime:"12:00"}});await receive("agende Fixture create amanhã às12","fixture-agenda-create");
 expect(m.api.createWorkspaceAppointment).toHaveBeenCalledExactlyOnceWith(m.scope,await mutationId("fixture-agenda-create"),expect.objectContaining({title:"Fixture create",startAt:"2026-10-20T15:00:00.000Z"}),"whatsapp");expect(m.legacy).not.toHaveBeenCalled();expect(m.global).not.toHaveBeenCalled();expect(saved).toBeNull();expect(m.clear.mock.invocationCallOrder.at(-1)).toBeGreaterThan(m.send.mock.invocationCallOrder.at(-1)!);
});
it("actual Agenda question keeps the original identity through a later time answer",async()=>{
 m.process.mockResolvedValue({intent:"agenda_create",confidence:.99,agendaData:{title:"Fixture create",startDate:"2026-10-20"}});await receive("agende Fixture create amanhã","fixture-agenda-question");expect(saved).toMatchObject({type:"slot_fill",missing:["startTime"]});expect(m.api.createWorkspaceAppointment).not.toHaveBeenCalled();
 await receive("14:30","fixture-agenda-answer");expect(m.api.createWorkspaceAppointment).toHaveBeenCalledWith(m.scope,await mutationId("fixture-agenda-question"),expect.objectContaining({startAt:"2026-10-20T17:30:00.000Z"}),"whatsapp");expect(saved).toBeNull();expect(m.legacy).not.toHaveBeenCalled();
});
it("actual Agenda response loss is explained safely and explicit retry retains exact source UUID/payload",async()=>{
 m.process.mockResolvedValue({intent:"agenda_create",confidence:.99,agendaData:{title:"Fixture create",startDate:"2026-10-20",startTime:"12:00"}});m.api.createWorkspaceAppointment.mockRejectedValueOnce(Error("GOOGLE_EVENT_STORAGE_UNAVAILABLE"));await receive("agende Fixture create amanhã às12","fixture-agenda-retry");const original=m.api.createWorkspaceAppointment.mock.calls[0];expect(saved).toMatchObject({type:"google_agenda_commit",receipts:[]});expect(reply()).toContain("tentar novamente");
 await receive("tentar novamente","fixture-agenda-new-response");expect(m.api.createWorkspaceAppointment.mock.calls[1]).toEqual(original);expect(saved).toBeNull();expect(m.legacy).not.toHaveBeenCalled();
});
it("a failed owner acknowledgement retains a confirmed receipt and retries only an authorized read",async()=>{
 m.process.mockResolvedValue({intent:"agenda_create",confidence:.99,agendaData:{title:"Fixture create",startDate:"2026-10-20",startTime:"12:00"}});m.send.mockRejectedValueOnce(Error("FIXTURE_ACK_LOST"));await receive("agende Fixture create amanhã às12","fixture-agenda-ack");const id=await mutationId("fixture-agenda-ack");expect(saved).toMatchObject({type:"google_agenda_commit",receipts:[{clientMutationId:id,recordId:id}]});
 m.api.getWorkspaceAppointment.mockResolvedValue({...record,id,title:"Fixture create"});await receive("tentar novamente","fixture-agenda-ack-reply");expect(m.api.createWorkspaceAppointment).toHaveBeenCalledOnce();expect(m.api.getWorkspaceAppointment).toHaveBeenCalledWith(m.scope,id);expect(saved).toBeNull();
});
