import {beforeEach,expect,it,vi} from "vitest";
const deps=vi.hoisted(()=>({rpc:vi.fn()}));vi.mock("server-only",()=>({}));vi.mock("./supabase",()=>({getSupabase:()=>({rpc:deps.rpc})}));
import {loadGoogleAppointmentRows,loadGoogleMeetRows} from "./google-event-readmodel";
const scope={userId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",mode:"business" as const,companyId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1"};
const eventId="eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1";
const sync={google_sync_version:"v1:1:0:0",google_sync_state:"succeeded",google_sync_failure_code:null,google_meet_pending:false,google_cancellation_pending:false};
const common={id:eventId,user_id:scope.userId,company_id:scope.companyId,workspace_legacy:false,title:"Fictitious title",description:null,start_at:"2070-01-01T10:00:00+00:00",end_at:"2070-01-01T11:00:00+00:00",status:"scheduled",source:"web",created_at:"2070-01-01T09:00:00+00:00",meet_link:null,calendar_event_id:null,ata_generated:false,ata_content:null,ata_notified_at:null,...sync};
const appointment={...common,location:null,all_day:false,repeat:"none",reminder_sent_at:null,reminder_15min_sent_at:null};
const meet={...common,meet_link:"",calendar_event_id:"",attendees:[{name:"Fictitious person",phone:"",email:""}]};
beforeEach(()=>{deps.rpc.mockReset().mockResolvedValue({data:[appointment],error:null});});
it("loads one explicit scoped snapshot without per-row/config/provider reads",async()=>{
 const rows=await loadGoogleAppointmentRows(scope);expect(rows).toEqual([appointment]);expect(Object.isFrozen(rows)).toBe(true);expect(Object.isFrozen(rows[0])).toBe(true);
 expect(deps.rpc).toHaveBeenCalledOnce();expect(deps.rpc).toHaveBeenCalledWith("zelo_google_appointment_rows",{p_user_id:scope.userId,p_mode:"business",p_company_id:scope.companyId,p_event_id:null,p_limit:1000});
});
it("captures exact specific-event/limit request and preserves canceled history",async()=>{
 deps.rpc.mockResolvedValue({data:[{...appointment,status:"cancelled"}],error:null});expect((await loadGoogleAppointmentRows(scope,{eventId,limit:1}))[0].status).toBe("cancelled");
 expect(deps.rpc).toHaveBeenLastCalledWith("zelo_google_appointment_rows",expect.objectContaining({p_event_id:eventId,p_limit:1}));
});
it("validates Meet row snapshot and freezes historical local attendees without provider fields",async()=>{
 deps.rpc.mockResolvedValue({data:[meet],error:null});const rows=await loadGoogleMeetRows(scope);expect(rows[0].attendees).toEqual(meet.attendees);expect(Object.isFrozen(rows[0].attendees[0])).toBe(true);
 expect(deps.rpc).toHaveBeenCalledWith("zelo_google_meet_rows",expect.objectContaining({p_company_id:scope.companyId}));
});
it("preserves visible personal legacy rows without assigning a private revision or pending state",async()=>{
 const row={...appointment,workspace_legacy:true,google_sync_version:null,google_sync_state:"legacy"};deps.rpc.mockResolvedValue({data:[row],error:null});
 expect((await loadGoogleAppointmentRows({...scope,mode:"personal",companyId:null}))[0].company_id).toBe(scope.companyId);
});
it.each([{limit:0},{limit:1001},{limit:1.5},{eventId:"bad"},{limit:1,ownerId:scope.userId}])("refuses invalid/additional query authority before RPC",async options=>{
 await expect(loadGoogleAppointmentRows(scope,options)).rejects.toThrow("GOOGLE_EVENT_READ_INVALID");expect(deps.rpc).not.toHaveBeenCalled();
});
it.each([{user_id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2"},{company_id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2"},{id:"bad"},{google_sync_version:"v1:01:0:0"},{google_sync_version:"v1:1:0"},
 {google_sync_state:"forever"},{google_sync_failure_code:"raw diagnostic"},{google_sync_state:"local",google_sync_version:"v1:1:0:0"},{google_sync_state:"waiting",google_meet_pending:false},
 {google_cancellation_pending:true},{google_meet_pending:true},{google_sync_state:"failed",google_sync_failure_code:null},{access_token:"fictitious"},{binding_id:eventId},{start_at:"bad"}])("fails closed on malformed/foreign/extra snapshot storage",async patch=>{
 deps.rpc.mockResolvedValue({data:[{...appointment,...patch}],error:null});await expect(loadGoogleAppointmentRows(scope)).rejects.toThrow("GOOGLE_EVENT_READ_STORAGE_INVALID");
});
it("keeps unresolved cancellation visible but refuses unrelated canceled list rows",async()=>{
 deps.rpc.mockResolvedValue({data:[{...appointment,status:"cancelled",google_sync_version:"v1:1:1:1",google_sync_state:"failed",google_sync_failure_code:"TEMPORARY",google_cancellation_pending:true}],error:null});expect((await loadGoogleAppointmentRows(scope))[0].google_cancellation_pending).toBe(true);
 deps.rpc.mockResolvedValue({data:[{...appointment,status:"cancelled"}],error:null});await expect(loadGoogleAppointmentRows(scope)).rejects.toThrow("GOOGLE_EVENT_READ_STORAGE_INVALID");
});
it("rejects duplicate/mismatched GET records and personal nonlegacy company rows",async()=>{
 deps.rpc.mockResolvedValue({data:[appointment,appointment],error:null});await expect(loadGoogleAppointmentRows(scope)).rejects.toThrow("GOOGLE_EVENT_READ_STORAGE_INVALID");
 deps.rpc.mockResolvedValue({data:[appointment],error:null});await expect(loadGoogleAppointmentRows(scope,{eventId:"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2"})).rejects.toThrow("GOOGLE_EVENT_READ_STORAGE_INVALID");
 await expect(loadGoogleAppointmentRows({...scope,mode:"personal",companyId:null})).rejects.toThrow("GOOGLE_EVENT_READ_STORAGE_INVALID");
});
it("captures scope/options before await and hides storage diagnostics",async()=>{
 let unblock!:(value:unknown)=>void;deps.rpc.mockImplementation(()=>new Promise(resolve=>{unblock=resolve;}));const mutable={...scope},options={eventId,limit:1};const result=loadGoogleAppointmentRows(mutable,options);
 mutable.companyId="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";options.eventId="eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2";unblock({data:[appointment],error:null});expect((await result)[0].id).toBe(eventId);
 deps.rpc.mockResolvedValue({data:null,error:{message:"hidden fictitious database diagnostic"}});await expect(loadGoogleAppointmentRows(scope)).rejects.toThrow("GOOGLE_EVENT_READ_UNAVAILABLE");
});
