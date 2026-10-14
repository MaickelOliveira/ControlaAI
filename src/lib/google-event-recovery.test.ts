import {beforeEach,expect,it,vi} from "vitest";
const deps=vi.hoisted(()=>({rpc:vi.fn(),creation:vi.fn(),command:vi.fn()}));vi.mock("server-only",()=>({}));vi.mock("./supabase",()=>({getSupabase:()=>({rpc:deps.rpc})}));
vi.mock("./google-event-creation-sync",()=>({synchronizeGoogleEventCreation:deps.creation}));vi.mock("./google-event-command-sync",()=>({synchronizeGoogleEventCommand:deps.command}));
import {pumpGoogleWorkspaceEvents} from "./google-event-recovery";
const user="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",company="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
function id(index:number){return "eeeeeeee-eeee-4eee-8eee-"+index.toString(16).padStart(12,"0");}
function job(index:number,command=false){return {user_id:user,mode:"business",company_id:company,event_id:id(index),operation_id:command?"ffffffff-ffff-4fff-8fff-"+index.toString(16).padStart(12,"0"):null};}
beforeEach(()=>{vi.resetAllMocks();deps.rpc.mockResolvedValue({data:[job(1),{...job(2,true),mode:"personal",company_id:null}],error:null});deps.creation.mockResolvedValue({state:"succeeded"});deps.command.mockResolvedValue({state:"waiting"});});
it("feeds only privately selected original references to the matching scoped workers and returns fixed counts",async()=>{
 const result=await pumpGoogleWorkspaceEvents();expect(result).toEqual({selected:2,completed:1,deferred:1});expect(Object.isFrozen(result)).toBe(true);
 expect(deps.rpc).toHaveBeenCalledOnce();expect(deps.rpc).toHaveBeenCalledWith("zelo_google_event_pending",{p_limit:20});
 expect(deps.creation).toHaveBeenCalledWith({userId:user,mode:"business",companyId:company},id(1));expect(deps.command).toHaveBeenCalledWith({userId:user,mode:"personal",companyId:null},id(2),job(2,true).operation_id);
 expect(Object.isFrozen(deps.command.mock.calls[0][0])).toBe(true);expect(JSON.stringify(result)).not.toContain(user);
});
it("caps dispatch concurrency at three while handling a full bounded batch",async()=>{
 deps.rpc.mockResolvedValue({data:Array.from({length:20},(_,i)=>job(i+1)),error:null});let running=0,max=0;
 deps.creation.mockImplementation(async()=>{running++;max=Math.max(max,running);await new Promise<void>(resolve=>setTimeout(resolve,1));running--;return {state:"succeeded"};});
 expect(await pumpGoogleWorkspaceEvents()).toEqual({selected:20,completed:20,deferred:0});expect(max).toBe(3);expect(deps.creation).toHaveBeenCalledTimes(20);
});
it("defers worker refusals and terminal failures without exposing diagnostics or skipping remaining jobs",async()=>{
 deps.rpc.mockResolvedValue({data:[job(1),job(2,true),job(3),job(4)],error:null});deps.creation.mockRejectedValueOnce(Error("hidden fictitious credential diagnostic")).mockResolvedValueOnce({state:"failed"}).mockResolvedValueOnce({state:"succeeded"});deps.command.mockResolvedValue({state:"running"});
 const log=vi.spyOn(console,"error").mockImplementation(()=>{});expect(await pumpGoogleWorkspaceEvents()).toEqual({selected:4,completed:1,deferred:3});expect(log).not.toHaveBeenCalled();log.mockRestore();
});
it.each([null,{},Array.from({length:21},(_,i)=>job(i+1)),[job(1),job(1)],[job(1),{...job(2),user_id:"bad"}],
 [{...job(1),trusted:true}],[{...job(1),mode:"default"}],[{...job(1),mode:"personal"}],[{...job(1),company_id:null}],[{...job(1),operation_id:"bad"}],[{...job(1),payload:{summary:"must not be fetched"}}]])("rejects a malformed batch before any partial dispatch",async data=>{
 deps.rpc.mockResolvedValue({data,error:null});await expect(pumpGoogleWorkspaceEvents()).rejects.toThrow("GOOGLE_EVENT_RECOVERY_STORAGE_INVALID");expect(deps.creation).not.toHaveBeenCalled();expect(deps.command).not.toHaveBeenCalled();
});
it("captures every reference before the first worker await",async()=>{
 const rows=[job(1),job(2),job(3),job(4)];deps.rpc.mockResolvedValue({data:rows,error:null});
 deps.creation.mockImplementation(async()=>{rows[3].event_id=id(90);rows[3].company_id="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";await Promise.resolve();return {state:"succeeded"};});
 expect((await pumpGoogleWorkspaceEvents()).completed).toBe(4);expect(deps.creation.mock.calls[3]).toEqual([{userId:user,mode:"business",companyId:company},id(4)]);
});
it("returns safe zero counts for no jobs and fails closed on a unavailable private selector",async()=>{
 deps.rpc.mockResolvedValue({data:[],error:null});expect(await pumpGoogleWorkspaceEvents()).toEqual({selected:0,completed:0,deferred:0});expect(deps.creation).not.toHaveBeenCalled();
 deps.rpc.mockResolvedValue({data:[job(1)],error:{message:"hidden fictitious storage credential"}});await expect(pumpGoogleWorkspaceEvents()).rejects.toThrow("GOOGLE_EVENT_RECOVERY_UNAVAILABLE");expect(deps.creation).not.toHaveBeenCalled();
});
