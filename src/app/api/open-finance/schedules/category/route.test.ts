import {beforeEach,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
const m=vi.hoisted(()=>({auth:vi.fn(),access:vi.fn(),rpc:vi.fn()}));
vi.mock("@/lib/auth",()=>({getSessionWithUser:m.auth}));
vi.mock("@/lib/open-finance-access",async()=>({...await vi.importActual("@/lib/open-finance-access"),getOpenFinanceAccess:m.access}));
vi.mock("@/lib/open-finance-http",async()=>({...await vi.importActual("@/lib/open-finance-http"),openFinanceRpc:m.rpc}));
import {PATCH} from "./route";
const id="00000000-0000-4000-8000-000000000001";
const scope={userId:"owner",mode:"business",environment:"production",companyId:"company"};
const request=(category:unknown="Assinaturas",scheduleId:unknown=id,origin="https://zelo.test")=>new Request("https://zelo.test/api/open-finance/schedules/category?mode=business",{method:"PATCH",headers:{origin,"content-type":"application/json"},body:JSON.stringify({scheduleId,category})});
beforeEach(()=>{vi.unstubAllEnvs();vi.resetAllMocks();m.auth.mockResolvedValue({session:{role:"client"},user:{id:"owner",customCategoriesExpense:["Minha categoria"]}});m.access.mockResolvedValue(scope);m.rpc.mockResolvedValue(true);});
it("requires a client, scoped bank access and the same origin before saving",async()=>{
 m.auth.mockResolvedValueOnce(null);expect((await PATCH(request())).status).toBe(401);
 m.access.mockResolvedValueOnce(null);expect((await PATCH(request())).status).toBe(404);
 expect((await PATCH(request("Assinaturas",id,"https://other.test"))).status).toBe(403);expect(m.rpc).not.toHaveBeenCalled();
});
it("accepts expense categories from this workspace and null reset, rejecting untrusted ids and categories",async()=>{
 for(const [category,target] of [["Salário",id],["Inventada",id],[{},id],["Assinaturas","invalid"]])expect((await PATCH(request(category,target))).status).toBe(400);
 expect((await PATCH(new Request("https://zelo.test/api/open-finance/schedules/category?mode=business",{method:"PATCH",headers:{origin:"https://zelo.test","content-type":"application/json"},body:JSON.stringify({scheduleId:id})}))).status).toBe(400);
 expect((await PATCH(request("Minha categoria"))).status).toBe(200);
 expect((await PATCH(request(null))).status).toBe(200);
 expect(m.rpc).toHaveBeenLastCalledWith(scope,"zelo_of_set_schedule_category",{p_schedule:id,p_category:null});
});
it("does not report success for another customer's or another workspace's schedule",async()=>{
 m.rpc.mockResolvedValueOnce(false);expect((await PATCH(request())).status).toBe(404);
 m.rpc.mockRejectedValueOnce(Error("private-storage-detail"));const response=await PATCH(request());expect(response.status).toBe(503);expect(await response.text()).not.toContain("private-storage-detail");
});
