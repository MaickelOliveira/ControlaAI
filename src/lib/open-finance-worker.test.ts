import {afterEach,beforeEach,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
const m=vi.hoisted(()=>({rpc:vi.fn(),user:vi.fn(),access:vi.fn(),sync:vi.fn(),publicEnabled:vi.fn(),retirement:vi.fn(),retirementEnabled:vi.fn()}));
vi.mock("./supabase",()=>({getSupabase:()=>({rpc:m.rpc})}));
vi.mock("./users",()=>({getUserById:m.user}));
vi.mock("./open-finance-access",()=>({getOpenFinanceAccess:m.access,isPublicOpenFinanceEnabled:m.publicEnabled}));
vi.mock("./open-finance-sync",()=>({runBankSyncPage:m.sync}));
vi.mock("./open-finance-retirement",()=>({runBankRetirement:m.retirement,isBankRetirementEnabled:m.retirementEnabled}));
import {runPublicBankSync,startOpenFinanceWorker} from "./open-finance-worker";
const id="550e8400-e29b-41d4-a716-446655440000";
beforeEach(()=>{vi.resetAllMocks();m.rpc.mockResolvedValue({data:{userId:id,mode:"business",environment:"production"}});m.user.mockResolvedValue({id});m.access.mockResolvedValue({userId:id,mode:"business",environment:"production"});m.sync.mockResolvedValue("done");});
afterEach(()=>{vi.unstubAllEnvs();vi.useRealTimers();});
it("rechecks the locally selected holder and current scope before downloading any bank data",async()=>{
  expect(await runPublicBankSync("business")).toBe("done");
  expect(m.user).toHaveBeenCalledWith(id);expect(m.access).toHaveBeenCalledWith({id},"business",{throwOnStorageError:true});
  expect(m.sync).toHaveBeenCalledWith({userId:id,mode:"business",environment:"production"});
  m.access.mockResolvedValue(null);await expect(runPublicBankSync("business")).rejects.toThrow("OF_ACCESS_DENIED");expect(m.sync).toHaveBeenCalledTimes(1);
});
it("passes the current owner exception only when explicitly enabled and fails closed on unavailable storage",async()=>{
  vi.stubEnv("OPEN_FINANCE_ENABLED","true");vi.stubEnv("OPEN_FINANCE_OWNER_EMAIL","OWNER@example.test");vi.stubEnv("OPEN_FINANCE_OWNER_BUSINESS_ENABLED","false");
  await runPublicBankSync("business");expect(m.rpc).toHaveBeenLastCalledWith("zelo_of_worker_scope",{p_mode:"business",p_owner_email:null});
  vi.stubEnv("OPEN_FINANCE_OWNER_BUSINESS_ENABLED","true");await runPublicBankSync("business");expect(m.rpc).toHaveBeenLastCalledWith("zelo_of_worker_scope",{p_mode:"business",p_owner_email:"owner@example.test"});
  m.rpc.mockResolvedValue({error:{message:"private"}});await expect(runPublicBankSync("business")).rejects.toThrow("OF_WORKER_UNAVAILABLE");
});
it("starts no public work when the public gate is off and can stop its timer",async()=>{
  vi.useFakeTimers();m.publicEnabled.mockReturnValue(false);vi.stubEnv("OPEN_FINANCE_SYNC_ENABLED","true");
  const stop=startOpenFinanceWorker();await vi.advanceTimersByTimeAsync(6000);stop();await vi.advanceTimersByTimeAsync(6000);
  expect(m.rpc).not.toHaveBeenCalled();expect(vi.getTimerCount()).toBe(0);
});
it("continues retiring disabled customers when new connections and collection are paused",async()=>{
  vi.useFakeTimers();m.publicEnabled.mockReturnValue(false);m.retirementEnabled.mockReturnValue(true);m.retirement.mockResolvedValue("idle");vi.stubEnv("OPEN_FINANCE_SYNC_ENABLED","false");
  const stop=startOpenFinanceWorker();await vi.advanceTimersByTimeAsync(31000);stop();await vi.advanceTimersByTimeAsync(31000);
  expect(m.retirement).toHaveBeenCalledTimes(2);expect(m.rpc).not.toHaveBeenCalled();expect(m.sync).not.toHaveBeenCalled();expect(vi.getTimerCount()).toBe(0);
});
it("does not let cancellation failures stop public synchronization",async()=>{
  vi.useFakeTimers();vi.spyOn(console,"error").mockImplementation(()=>{});m.publicEnabled.mockReturnValue(true);m.retirementEnabled.mockReturnValue(true);m.retirement.mockRejectedValue(Error("temporary"));vi.stubEnv("OPEN_FINANCE_SYNC_ENABLED","true");
  const stop=startOpenFinanceWorker();await vi.advanceTimersByTimeAsync(21000);stop();
  expect(m.retirement).toHaveBeenCalledTimes(1);expect(m.sync).toHaveBeenCalled();vi.restoreAllMocks();
});
it("checks both platforms promptly and makes at most four idle scope requests per minute",async()=>{
  vi.useFakeTimers();m.publicEnabled.mockReturnValue(true);vi.stubEnv("OPEN_FINANCE_SYNC_ENABLED","true");
  m.rpc.mockResolvedValue({data:null});
  const stop=startOpenFinanceWorker();await vi.advanceTimersByTimeAsync(59_000);stop();
  const scopeCalls=m.rpc.mock.calls.filter(([operation])=>operation==="zelo_of_worker_scope");
  expect(scopeCalls).toHaveLength(4);expect(scopeCalls.slice(0,2).map(([,args])=>args.p_mode)).toEqual(["personal","business"]);
  expect(vi.getTimerCount()).toBe(0);
});
it("keeps the short interval while a platform has queued work",async()=>{
  vi.useFakeTimers();m.publicEnabled.mockReturnValue(true);vi.stubEnv("OPEN_FINANCE_SYNC_ENABLED","true");
  m.rpc.mockImplementation(async(name:string,args:{p_mode:string})=>({data:name==="zelo_of_worker_scope"?{userId:id,mode:args.p_mode,environment:"production"}:0}));
  const stop=startOpenFinanceWorker();await vi.advanceTimersByTimeAsync(6_000);stop();
  expect(m.sync).toHaveBeenCalledTimes(4);
});
it("backs off repeated storage failures without stopping cancellation or exposing error payloads",async()=>{
  vi.useFakeTimers();const errorLog=vi.spyOn(console,"error").mockImplementation(()=>{});
  m.publicEnabled.mockReturnValue(true);m.retirementEnabled.mockReturnValue(true);m.retirement.mockResolvedValue("idle");vi.stubEnv("OPEN_FINANCE_SYNC_ENABLED","true");
  m.rpc.mockResolvedValue({error:{message:"private database error"}});
  const stop=startOpenFinanceWorker();await vi.advanceTimersByTimeAsync(89_000);stop();
  expect(m.rpc.mock.calls.filter(([name])=>name==="zelo_of_worker_scope")).toHaveLength(4);
  expect(m.retirement).toHaveBeenCalledTimes(3);expect(errorLog).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(errorLog.mock.calls)).not.toContain("private database error");vi.restoreAllMocks();
});
