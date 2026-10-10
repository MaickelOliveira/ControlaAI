import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only",()=>({}));
const m=vi.hoisted(()=>({rpc:vi.fn(),page:vi.fn(),request:vi.fn()}));
vi.mock("./open-finance-http",()=>({openFinanceRpc:m.rpc}));
vi.mock("./polp-production",async original=>({...await original<typeof import("./polp-production")>(),polpProductionPage:m.page,polpProductionRequest:m.request}));
import { runBankSyncPage } from "./open-finance-sync";
const id="550e8400-e29b-41d4-a716-446655440000", user="650e8400-e29b-41d4-a716-446655440000";
const scope={userId:user,mode:"personal" as const,environment:"production" as const};
const base={id,lease_token:id,connection_id:id,external_consent_id:id,institution_id:id,cursor:null,filter_window:{},kind:"catalog",family:"credit-cards",external_resource_id:id};
beforeEach(()=>{vi.resetAllMocks();m.rpc.mockResolvedValueOnce(base).mockResolvedValue(null);});
it("atomically persists card limits and schedules bills and movements without raw bank data",async()=>{
  m.page.mockResolvedValue({data:[{id:"card-1",consent_id:id,name:"Card",documents:{cpf:"private-document"},limits:[{identification_number:"1234",limit_amount:{amount:"5000",currency:"BRL"},available_amount:null}]}],nextCursor:"page-2"});
  expect(await runBankSyncPage(scope)).toBe("processed");
  const args=m.rpc.mock.lastCall?.[2];
  expect(args?.p_next).toBe("page-2");
  expect(args?.p_rows.limits[0]).toMatchObject({total_amount:"5000",available_amount:null});
  expect(args?.p_children.map((j:{kind:string})=>j.kind)).toEqual(["bills","transactions"]);
  expect(JSON.stringify(args)).not.toContain("private-document");
});
it("never commits or advances a page with an unrelated source resource",async()=>{
  m.page.mockResolvedValue({data:[{id:"card-1",consent_id:"other"}],nextCursor:null});
  expect(await runBankSyncPage(scope)).toBe("failed");
  expect(m.rpc.mock.calls.map(c=>c[1])).toEqual(["zelo_of_claim","zelo_of_fail_job"]);
  expect(m.rpc.mock.lastCall?.[2]?.p_error).toBe("CONSENT_IDENTITY_MISMATCH");
});
it("confirms source ownership before importing and keeps unavailable resources visible as gaps",async()=>{
  m.rpc.mockReset();m.rpc.mockResolvedValueOnce({...base,kind:"consent",family:"consents",scopes:["ACCOUNT","INVESTMENTS"]}).mockResolvedValue(null);
  m.request.mockResolvedValueOnce({data:{id,cliente_user_id:user,institution_id:id,status:"AUTHORISED",products:["ACCOUNT","INVESTMENTS"],flags:["PARTIALLY_UNAVAILABLE_RESOURCES"]}}).mockResolvedValueOnce({data:[{type:"ACCOUNT",status:"AVAILABLE",resource_id:"account-1"},{type:"UNARRANGED_ACCOUNT_OVERDRAFT",status:"AVAILABLE",resource_id:null}]});
  expect(await runBankSyncPage(scope)).toBe("processed");
  expect(m.rpc.mock.lastCall?.[2]?.p_rows.sync_notes).toContain("SOURCE_PARTIAL");
  expect(m.rpc.mock.lastCall?.[2]?.p_rows.sync_notes).toContain("UNSUPPORTED_CREDIT_DETAILS");
  expect(m.rpc.mock.lastCall?.[2]?.p_children.every((j:{family:string})=>j.family!=="credit-cards")).toBe(true);
});
it("keeps provider or storage failures retryable without committing partial output",async()=>{
  m.page.mockRejectedValue(new Error("POLP_HTTP_429"));
  expect(await runBankSyncPage(scope)).toBe("failed");
  expect(m.rpc.mock.lastCall?.[2]).toMatchObject({p_job:id,p_lease:id,p_error:"POLP_HTTP_429"});
});
