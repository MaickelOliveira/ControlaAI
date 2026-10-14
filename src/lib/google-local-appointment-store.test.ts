import {beforeEach,expect,it,vi} from "vitest";
import type {GoogleWorkspace} from "./google-workspace-policy";
const db=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock("server-only",()=>({}));vi.mock("./supabase",()=>({getSupabase:()=>db}));
import {googleEventCreationPayload} from "./google-event-payload";
import {loadLocalAppointmentReceipt,prepareLocalAppointmentReceipt} from "./google-local-appointment-store";
const owner="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",event="eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1";
const scope:GoogleWorkspace={userId:owner,mode:"personal",companyId:null};
const payload=googleEventCreationPayload({summary:"Fixture",description:"",location:"",startAt:"2070-01-01T10:00:00Z",endAt:"2070-01-01T11:00:00Z",allDay:false,repeat:"none",attendees:[],withMeet:false});
function row(patch:Record<string,unknown>={}){return {event_id:event,user_id:owner,mode:"personal",company_id:null,payload,source:"web",...patch};}
beforeEach(()=>{vi.clearAllMocks();db.rpc.mockResolvedValue({data:row(),error:null});});
it("reads original immutable local intention through exact authenticated scope",async()=>{
 const result=await loadLocalAppointmentReceipt(scope,event);expect(result).toEqual({eventId:event,workspace:scope,payload,source:"web"});
 expect(Object.isFrozen(result)).toBe(true);expect(Object.isFrozen(result?.payload.attendees)).toBe(true);
 expect(db.rpc).toHaveBeenCalledWith("zelo_google_local_appointment_get",{p_user_id:owner,p_mode:"personal",p_company_id:null,p_event_id:event});
});
it("stores canonical immutable input once and validates receipt before returning",async()=>{
 const result=await prepareLocalAppointmentReceipt(scope,event,payload,"web");expect(result?.payload).toEqual(payload);
 expect(db.rpc).toHaveBeenCalledTimes(1);expect(db.rpc.mock.calls[0]).toEqual(["zelo_google_local_appointment_create",{p_user_id:owner,p_mode:"personal",p_company_id:null,p_event_id:event,p_payload:payload,p_source:"web"}]);
});
it("returns no receipt for legacy or missing rows without adopting them",async()=>{db.rpc.mockResolvedValue({data:null,error:null});expect(await loadLocalAppointmentReceipt(scope,event)).toBeNull();});
it.each([{...scope,trusted:true},{...scope,companyId:owner},{...scope,userId:"bad"}])("rejects malformed/extra scopes before storage %#",async bad=>{await expect(loadLocalAppointmentReceipt(bad as GoogleWorkspace,event)).rejects.toThrow("GOOGLE_EVENT_INPUT_INVALID");expect(db.rpc).not.toHaveBeenCalled();});
it.each(["bad",null])( "rejects malformed UUID before storage %#",async bad=>{await expect(loadLocalAppointmentReceipt(scope,bad as string)).rejects.toThrow("GOOGLE_EVENT_INPUT_INVALID");expect(db.rpc).not.toHaveBeenCalled();});
it.each([{...payload,withMeet:true},{...payload,providerId:"bad"}])("never stores a conference/provider control in a local receipt %#",async bad=>{await expect(prepareLocalAppointmentReceipt(scope,event,bad as typeof payload,"web")).rejects.toThrow("GOOGLE_EVENT_INPUT_INVALID");expect(db.rpc).not.toHaveBeenCalled();});
it.each([{user_id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2"},{mode:"business"},{company_id:owner},{event_id:owner},{source:"test"},{payload:{...payload,withMeet:true}},{token:"bad"}])("refuses substituted or overbroad storage receipts %#",async patch=>{db.rpc.mockResolvedValue({data:row(patch),error:null});await expect(loadLocalAppointmentReceipt(scope,event)).rejects.toThrow("GOOGLE_EVENT_STORAGE_INVALID");});
it("refuses different persisted intent even when receipt scope is valid",async()=>{db.rpc.mockResolvedValue({data:row({payload:{...payload,summary:"Changed"}}),error:null});await expect(prepareLocalAppointmentReceipt(scope,event,payload,"web")).rejects.toThrow("GOOGLE_EVENT_STORAGE_INVALID");});
it("captures mutable scope and payload before any await",async()=>{
 const mutableScope={...scope},mutablePayload={...payload};db.rpc.mockImplementation(async()=>{mutableScope.userId="bad";mutablePayload.summary="Changed";return {data:row(),error:null};});
 const result=await prepareLocalAppointmentReceipt(mutableScope,event,mutablePayload,"web");expect(result.payload.summary).toBe("Fixture");expect(db.rpc.mock.calls[0][1].p_payload.summary).toBe("Fixture");
});
it.each(["GOOGLE_EVENT_INVALID","GOOGLE_EVENT_LOCAL_CONFLICT","GOOGLE_WORKSPACE_ACCESS_DENIED"])("keeps fixed failures without retry: %s",async message=>{db.rpc.mockResolvedValue({data:null,error:{message}});await expect(loadLocalAppointmentReceipt(scope,event)).rejects.toThrow(message);expect(db.rpc).toHaveBeenCalledTimes(1);});
it("drops arbitrary storage diagnostics",async()=>{db.rpc.mockRejectedValue(Error("private fictitious diagnostic"));const error=await loadLocalAppointmentReceipt(scope,event).catch(e=>e);expect(error.message).toBe("GOOGLE_EVENT_STORAGE_UNAVAILABLE");expect(error.stack).not.toContain("fictitious diagnostic");expect(error).not.toHaveProperty("cause");});
