import {afterEach,beforeEach,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
const m=vi.hoisted(()=>({rpc:vi.fn(),revoke:vi.fn()}));
vi.mock("./supabase",()=>({getSupabase:()=>({rpc:m.rpc})}));
vi.mock("./open-finance-revocation",()=>({revokeProductionConsent:m.revoke}));
import {isBankRetirementEnabled,runBankRetirement} from "./open-finance-retirement";
const id="550e8400-e29b-41d4-a716-446655440000",user="650e8400-e29b-41d4-a716-446655440000",external="750e8400-e29b-41d4-a716-446655440000";
const claim={id,user_id:user,external_consent_id:external,retirement_lease_token:id};
beforeEach(()=>{vi.resetAllMocks();m.rpc.mockResolvedValueOnce({data:claim,error:null}).mockResolvedValue({error:null});m.revoke.mockResolvedValue("REVOKED");});
afterEach(()=>vi.unstubAllEnvs());
it("keeps cancellation running independently of collection gates and excludes the preview",()=>{
  vi.stubEnv("OPEN_FINANCE_ENABLED","true");vi.stubEnv("POLP_PRODUCTION_CLIENT_ID","test");vi.stubEnv("POLP_PRODUCTION_CLIENT_SECRET","test");vi.stubEnv("OPEN_FINANCE_PUBLIC_ENABLED","false");vi.stubEnv("OPEN_FINANCE_SYNC_ENABLED","false");vi.stubEnv("OPEN_FINANCE_PREVIEW_ONLY","false");
  expect(isBankRetirementEnabled()).toBe(true);
  vi.stubEnv("OPEN_FINANCE_PREVIEW_ONLY","true");expect(isBankRetirementEnabled()).toBe(false);
  vi.stubEnv("OPEN_FINANCE_PREVIEW_ONLY","false");vi.stubEnv("OPEN_FINANCE_RETIREMENT_ENABLED","false");expect(isBankRetirementEnabled()).toBe(false);
});
it("cancels one leased production consent and records confirmation without deleting client history",async()=>{
  expect(await runBankRetirement()).toBe("processed");expect(m.revoke).toHaveBeenCalledWith(external,user);
  expect(m.rpc.mock.calls).toEqual([["zelo_of_claim_retirement"],["zelo_of_finish_retirement",{p_id:id,p_lease:id,p_error:null,p_provider_status:"REVOKED"}]]);
});
it("records a retryable failure with no private provider response in storage",async()=>{
  m.revoke.mockRejectedValue(Error("provider private message with document 123"));
  expect(await runBankRetirement()).toBe("failed");expect(m.rpc.mock.lastCall?.[1]).toEqual({p_id:id,p_lease:id,p_error:"OF_CANCELLATION_UNCONFIRMED",p_provider_status:null});
});
it("does not contact the provider on idle, failed or malformed claims",async()=>{
  m.rpc.mockReset();m.rpc.mockResolvedValueOnce({data:null});expect(await runBankRetirement()).toBe("idle");
  m.rpc.mockResolvedValueOnce({error:{message:"private"}});await expect(runBankRetirement()).rejects.toThrow("OF_RETIREMENT_UNAVAILABLE");
  m.rpc.mockResolvedValueOnce({data:{...claim,external_consent_id:"invalid"}});await expect(runBankRetirement()).rejects.toThrow("INVALID_ID");
  expect(m.revoke).not.toHaveBeenCalled();
});
it("leaves successful but unrecorded cancellations leased for recovery",async()=>{
  m.rpc.mockReset();m.rpc.mockResolvedValueOnce({data:claim}).mockResolvedValue({error:{message:"private"}});
  await expect(runBankRetirement()).rejects.toThrow("OF_RETIREMENT_UNAVAILABLE");expect(m.rpc).toHaveBeenCalledTimes(2);
});
