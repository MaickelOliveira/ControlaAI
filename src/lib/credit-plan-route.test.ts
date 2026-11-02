import {beforeEach,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
const m=vi.hoisted(()=>({scope:vi.fn(),rpc:vi.fn()}));
vi.mock("./open-finance-http",()=>({openFinanceRequestScope:m.scope,openFinanceRpc:m.rpc,OF_HEADERS:{"Cache-Control":"private, no-store"}}));
vi.mock("./company-context",()=>({runWithCompanyRequest:(fn:()=>Promise<unknown>)=>fn()}));
import {PUT} from "@/app/api/open-finance/credit-plan/route";
const id="30000000-0000-4000-8000-000000000001";
const plan={resource_id:id,amount:"890.10",currency:"BRL",first_due_date:"2026-09-30",last_due_date:"2027-05-30"};
const scope={userId:"owner",companyId:"company-a",mode:"business",environment:"production"};
const request=(body:unknown)=>new Request("https://zelo.example/api/open-finance/credit-plan?mode=business",{method:"PUT",body:JSON.stringify(body)});
beforeEach(()=>{vi.resetAllMocks();m.scope.mockResolvedValue(scope);m.rpc.mockResolvedValue(true);});
it("requires the verified mutation scope, limits stored fields, and never accepts a supplied owner or company",async()=>{
 const response=await PUT(request({...plan,userId:"other",companyId:"other"}));expect(response.status).toBe(200);
 expect(m.scope).toHaveBeenCalledWith(expect.any(Request),true);
 expect(m.rpc).toHaveBeenCalledWith(scope,"zelo_of_set_credit_plan",{p_resource:id,p_plan:{amount:plan.amount,currency:"BRL",first_due_date:plan.first_due_date,last_due_date:plan.last_due_date}});
 expect(response.headers.get("Cache-Control")).toBe("private, no-store");
});
it("preserves session/origin rejection without writing anything",async()=>{
 m.scope.mockResolvedValue(new Response(null,{status:403}));expect((await PUT(request(plan))).status).toBe(403);expect(m.rpc).not.toHaveBeenCalled();
});
it("validates money, required dates, request size, currency and resource identity",async()=>{
 for(const patch of [{amount:"0"},{amount:"1.001"},{currency:""},{first_due_date:"2026-02-30"},{last_due_date:"2026-01-01"},{resource_id:"foreign-id"}])expect((await PUT(request({...plan,...patch}))).status).toBe(400);
 expect((await PUT(request({...plan,extra:"x".repeat(3000)}))).status).toBe(400);expect(m.rpc).not.toHaveBeenCalled();
});
it("returns no false success for another workspace or a failed write",async()=>{
 m.rpc.mockResolvedValue(false);expect((await PUT(request(plan))).status).toBe(404);
 m.rpc.mockRejectedValue(Error("private fixture detail"));const failed=await PUT(request(plan));expect(failed.status).toBe(503);expect(await failed.text()).not.toContain("private fixture detail");
});
