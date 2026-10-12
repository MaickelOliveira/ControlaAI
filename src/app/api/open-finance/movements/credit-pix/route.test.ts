import {beforeEach,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
const {scope,rpc}=vi.hoisted(()=>({scope:vi.fn(),rpc:vi.fn()}));
vi.mock("@/lib/open-finance-http",()=>({openFinanceRequestScope:scope,openFinanceRpc:rpc,OF_HEADERS:{"Cache-Control":"private, no-store"}}));
import {POST,DELETE} from "./route";
const credit="00000000-0000-4000-8000-000000000001",payment="00000000-0000-4000-8000-000000000002",link="00000000-0000-4000-8000-000000000099";
const body={creditMovementId:credit,paymentMovementId:payment,grossAmount:"850.16",paymentAmount:"821.48",chargesAmount:"28.68",confirmed:true,creditDate:"2026-09-10",paymentDate:"2026-09-10"};
const verified={userId:"verified-holder",mode:"business",environment:"production",companyId:"verified-company"};
const req=(value:unknown,method="POST")=>new Request("https://zelo.test/api/open-finance/movements/credit-pix?mode=business",{method,headers:{origin:"https://zelo.test","content-type":"application/json"},body:JSON.stringify(value)});
beforeEach(()=>{scope.mockReset().mockResolvedValue(verified);rpc.mockReset().mockResolvedValue({id:link});});
it("retains session/origin/access failure before reading or writing a confirmation",async()=>{
 for(const status of [401,403,404]){scope.mockResolvedValueOnce(new Response(null,{status}));expect((await POST(req(body))).status).toBe(status);}
 expect(rpc).not.toHaveBeenCalled();expect(scope).toHaveBeenCalledWith(expect.any(Request),true);
});
it("requires an explicit confirmation and exact positive BRL cent snapshots",async()=>{
 for(const patch of [{confirmed:false},{confirmed:undefined},{grossAmount:850.16},{grossAmount:"850.17"},{paymentAmount:"0"},{chargesAmount:"-1"},{chargesAmount:"28.680001"},{creditMovementId:"bad"},{paymentMovementId:credit},{creditDate:null},{paymentDate:"2026-02-30"}])expect((await POST(req({...body,...patch}))).status).toBe(400);
 expect(rpc).not.toHaveBeenCalled();
});
it("writes only the session-scoped pair and the confirmed values, ignoring forged scope",async()=>{
 const response=await POST(req({...body,userId:"attacker",mode:"personal",companyId:"other"}));expect(response.status).toBe(200);
 expect(rpc).toHaveBeenCalledWith(verified,"zelo_of_confirm_credit_pix",{p_credit:credit,p_payment:payment,p_gross:"850.16",p_payment_amount:"821.48",p_charges:"28.68",p_confirmed:true,p_credit_date:"2026-09-10",p_payment_date:"2026-09-10"});
 expect(response.headers.get("cache-control")).toContain("no-store");
});
it("accepts an explicitly confirmed zero-charge loan, never an inferred missing fee",async()=>{
 expect((await POST(req({...body,paymentAmount:"850.16",chargesAmount:"0"}))).status).toBe(200);
 expect((await POST(req({...body,chargesAmount:null}))).status).toBe(400);
});
it("undo is a scoped soft annotation change with invalid/missing IDs rejected",async()=>{
 rpc.mockResolvedValueOnce(true);expect((await DELETE(req({reconciliationId:link},"DELETE"))).status).toBe(200);
 expect(rpc).toHaveBeenLastCalledWith(verified,"zelo_of_undo_credit_pix",{p_reconciliation:link});
 rpc.mockResolvedValueOnce(false);expect((await DELETE(req({reconciliationId:link},"DELETE"))).status).toBe(404);
 expect((await DELETE(req({reconciliationId:"bad"},"DELETE"))).status).toBe(400);
});
it("caps actual bytes and never exposes database errors or claims failed writes succeeded",async()=>{
 expect((await POST(req({...body,extra:"x".repeat(10000)}))).status).toBe(400);
 rpc.mockRejectedValueOnce(Error("PRIVATE_DATABASE_ERROR"));const response=await POST(req(body));expect(response.status).toBe(503);expect(await response.text()).not.toContain("PRIVATE");
 rpc.mockResolvedValueOnce(null);expect((await POST(req(body))).status).toBe(503);
});
