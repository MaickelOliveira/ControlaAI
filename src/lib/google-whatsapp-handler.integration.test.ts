import {afterEach,beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({owner:vi.fn(),send:vi.fn(),process:vi.fn(),pending:vi.fn(),save:vi.fn(),clear:vi.fn(),legacy:vi.fn(),global:vi.fn(),globalMeet:vi.fn(),confirmed:true,scope:{userId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",companyId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",mode:"business" as "personal"|"business"},api:{listWorkspaceAppointments:vi.fn(),getWorkspaceAppointment:vi.fn(),getWorkspaceMeet:vi.fn(),createWorkspaceAppointment:vi.fn(),createWorkspaceMeet:vi.fn(),updateWorkspaceAppointment:vi.fn(),cancelWorkspaceAppointment:vi.fn(),addWorkspaceAppointmentMeet:vi.fn(),retryWorkspaceGoogleEvent:vi.fn()}}));
vi.mock("server-only",()=>({}));
vi.mock("./google-event-service",()=>m.api);
vi.mock("./google-whatsapp-service",()=>({loadGoogleWhatsAppConsumer:async()=>{const {createGoogleWhatsAppConsumer}=await import("./google-whatsapp-consumer");return createGoogleWhatsAppConsumer(m.api);}}));
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
