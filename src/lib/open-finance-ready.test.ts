import { afterEach,beforeEach,expect,it,vi } from "vitest";
vi.mock("server-only",()=>({}));
const rpc=vi.hoisted(()=>vi.fn());
vi.mock("./open-finance-http",()=>({openFinanceRpc:rpc}));
import { isBankConnectReady } from "./open-finance-ready";
const scope={userId:"owner",mode:"personal" as const,environment:"production" as const};
beforeEach(()=>{vi.resetAllMocks();for(const [key,value] of Object.entries({OPEN_FINANCE_CONNECT_ENABLED:"true",OPEN_FINANCE_SYNC_ENABLED:"true",OPEN_FINANCE_AUTH_HOSTS:"authorize.example",OPEN_FINANCE_APP_ORIGIN:"https://preview.example",POLP_WEBHOOK_SIGNING_SECRET:"s".repeat(32),OPEN_FINANCE_SYNC_CRON_SECRET:"c".repeat(32)}))vi.stubEnv(key,value);rpc.mockResolvedValue({version:"private-sync-v4",worker_recent:true});});
afterEach(()=>vi.unstubAllEnvs());
it("cannot create a bank consent before persistence and an active worker are confirmed",async()=>{
  expect(await isBankConnectReady(scope)).toBe(true);
  rpc.mockResolvedValue({version:"private-sync-v4",worker_recent:false});expect(await isBankConnectReady(scope)).toBe(false);
  rpc.mockRejectedValue(new Error("RPC missing"));expect(await isBankConnectReady(scope)).toBe(false);
});
it("fails closed before any bank or storage call if configuration is incomplete",async()=>{
  vi.stubEnv("OPEN_FINANCE_APP_ORIGIN","");expect(await isBankConnectReady(scope)).toBe(false);expect(rpc).not.toHaveBeenCalled();
});
