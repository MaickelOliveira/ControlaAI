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
  expect(args?.p_children.map((j:{kind:string})=>j.kind)).toEqual(["bills","transactions","recurrings","installments"]);
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
it("refreshes card predictions after a complete transaction import, never before the final page",async()=>{
  m.rpc.mockReset();m.rpc.mockResolvedValueOnce({...base,kind:"transactions",external_resource_id:"card-1"}).mockResolvedValue(null);
  m.page.mockResolvedValue({data:[],nextCursor:null});
  expect(await runBankSyncPage(scope)).toBe("processed");
  expect(m.rpc.mock.lastCall?.[2]?.p_children.map((j:{kind:string})=>j.kind)).toEqual(["recurrings","installments","bills"]);
});
it("imports the paginated v2 recurring endpoint as predictions",async()=>{
  m.rpc.mockReset();m.rpc.mockResolvedValueOnce({...base,kind:"recurrings",external_resource_id:"card-1"}).mockResolvedValue(null);
  m.page.mockResolvedValue({data:[{description:"Streaming",averageAmount:-40,currency:"BRL",periodMonths:1,expectedDay:11,firstOccurrenceAt:"2026-07-11",lastOccurrenceAt:"2026-09-11",nextExpectedAt:"2026-10-11",occurrences:["a","b","c"],regularityScore:1}],nextCursor:null});
  expect(await runBankSyncPage(scope)).toBe("processed");
  expect(m.page).toHaveBeenCalledWith("/credit-cards/card-1/recurrings",null,{});
  expect(m.rpc.mock.lastCall?.[2]?.p_rows.schedules[0]).toMatchObject({kind:"recurring",amount:"40.00"});
});
it("keeps the bill status unknown while retaining its explicit payment evidence",async()=>{
  m.rpc.mockReset();m.rpc.mockResolvedValueOnce({...base,kind:"bills",external_resource_id:"card-1"}).mockResolvedValue(null);
  m.page.mockResolvedValue({data:[{id:"bill-1",credit_card_id:"card-1",due_date:"2026-10-11",bill_total_amount:{amount:"100.00",currency:"BRL"},payments:[{amount:"100.00",currency:"BRL",paymentDate:"2026-10-10"}]}],nextCursor:null});
  expect(await runBankSyncPage(scope)).toBe("processed");
  expect(m.rpc.mock.lastCall?.[2]?.p_rows.bills[0]).toMatchObject({status:"unknown",payment_amount:"100.00000000",payment_evidence:true});
});
it("rejects transactions falsely attached to another bill",async()=>{
  m.rpc.mockReset();m.rpc.mockResolvedValueOnce({...base,kind:"bill-transactions",external_resource_id:"card-1",filter_window:{billId:"bill-1"}}).mockResolvedValue(null);
  m.page.mockResolvedValue({data:[{id:"tx",credit_card_id:"card-1",bill_id:"bill-other"}],nextCursor:null});
  expect(await runBankSyncPage(scope)).toBe("failed");
  expect(m.rpc.mock.lastCall?.[2]?.p_error).toBe("BILL_IDENTITY_MISMATCH");
});
