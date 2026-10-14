import {beforeEach,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
const m=vi.hoisted(()=>({create:vi.fn(),update:vi.fn(),remove:vi.fn(),connected:vi.fn(),query:vi.fn(),write:vi.fn()}));
vi.mock("./google-calendar",()=>({createGoogleCalendarEvent:m.create,updateGoogleCalendarEvent:m.update,deleteGoogleCalendarEvent:m.remove}));
vi.mock("./google-oauth",()=>({isConnected:m.connected}));
vi.mock("./supabase",()=>({getSupabase:()=>({from:m.query})}));
import {updateAppointment} from "./agenda";
const row={id:"90000000-0000-4000-8000-000000000001",user_id:"90000000-0000-4000-8000-000000000002",title:"Meeting",description:"Description",location:"Office",start_at:"2026-10-20T12:00:00Z",end_at:"2026-10-20T13:00:00Z",all_day:false,repeat:"none",status:"scheduled",source:"web",created_at:"2026-10-13T12:00:00Z",meet_link:"https://meet.google.com/abc-defg-hij",calendar_event_id:'gcal:{"eventId":"fictitious","calendarId":"original"}',ata_generated:false,ata_content:null,ata_notified_at:null,reminder_sent_at:null,reminder_15min_sent_at:null};
beforeEach(()=>{
 vi.resetAllMocks();
 let patch:Record<string,unknown>={};
 const query={select:vi.fn(()=>query),eq:vi.fn(()=>query),maybeSingle:vi.fn(async()=>({data:{...row,...patch},error:null})),update:m.write};
 m.write.mockImplementation((value:Record<string,unknown>)=>{patch=value;return query;});m.query.mockReturnValue(query);
});
it.each([
 {ataGenerated:true,ataContent:"Meeting notes",ataNotifiedAt:"2026-10-20T14:00:00Z"},
 {reminderSentAt:"2026-10-20T10:00:00Z"},
 {reminder15MinSentAt:"2026-10-20T11:45:00Z"},
 {status:"done" as const},
 {meetLink:"https://meet.google.com/aaa-bbbb-ccc",calendarEventId:"verified-local-publication",googleCalendarId:"original"},
 {title:row.title,startAt:row.start_at}
])("keeps local metadata and unchanged event fields provider-free (%j)",async patch=>{
 const result=await updateAppointment(row.id,row.user_id,patch);
 expect(result).not.toBeNull();expect(m.write).toHaveBeenCalledOnce();
 expect(m.connected).not.toHaveBeenCalled();expect(m.create).not.toHaveBeenCalled();expect(m.update).not.toHaveBeenCalled();expect(m.remove).not.toHaveBeenCalled();
});
it("still sends a real schedule change to the original Calendar target",async()=>{
 await updateAppointment(row.id,row.user_id,{startAt:"2026-10-21T12:00:00Z",endAt:"2026-10-21T13:00:00Z"});
 expect(m.update).toHaveBeenCalledOnce();expect(m.update).toHaveBeenCalledWith(expect.objectContaining({calendarEventId:"fictitious",googleCalendarId:"original",startAt:"2026-10-21T12:00:00Z"}));expect(m.remove).not.toHaveBeenCalled();
});
it("keeps explicit cancellation distinct from local completion",async()=>{
 await updateAppointment(row.id,row.user_id,{status:"cancelled"});expect(m.remove).toHaveBeenCalledWith(row.user_id,"fictitious","original");expect(m.update).not.toHaveBeenCalled();
});
