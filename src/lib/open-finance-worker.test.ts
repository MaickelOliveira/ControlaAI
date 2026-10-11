import {afterEach,beforeEach,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
const m=vi.hoisted(()=>({rpc:vi.fn(),user:vi.fn(),access:vi.fn(),sync:vi.fn(),publicEnabled:vi.fn()}));
vi.mock("./supabase",()=>({getSupabase:()=>({rpc:m.rpc})}));
vi.mock("./users",()=>({getUserById:m.user}));
vi.mock("./open-finance-access",()=>({getOpenFinanceAccess:m.access,isPublicOpenFinanceEnabled:m.publicEnabled}));
vi.mock("./open-finance-sync",()=>({runBankSyncPage:m.sync}));
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
