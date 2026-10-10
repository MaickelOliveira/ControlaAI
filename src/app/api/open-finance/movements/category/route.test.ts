import {beforeEach,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
const {auth,access,rpc}=vi.hoisted(()=>({auth:vi.fn(),access:vi.fn(),rpc:vi.fn()}));
vi.mock("@/lib/auth",()=>({getSessionWithUser:auth}));
vi.mock("@/lib/open-finance-access",async()=>({...await vi.importActual("@/lib/open-finance-access"),getOpenFinanceAccess:access}));
vi.mock("@/lib/open-finance-http",async()=>({...await vi.importActual("@/lib/open-finance-http"),openFinanceRpc:rpc}));
import {PATCH} from "./route";
const id="00000000-0000-4000-8000-000000000001";
function request(body:unknown,origin="https://zelo.test"){return new Request("https://zelo.test/api/open-finance/movements/category?mode=business",{method:"PATCH",headers:{origin,"content-type":"application/json"},body:JSON.stringify(body)});}
beforeEach(()=>{vi.unstubAllEnvs();auth.mockReset().mockResolvedValue({session:{role:"client"},user:{id:"owner",customCategoriesExpense:["Categoria especial"]}});access.mockReset().mockResolvedValue({userId:"owner",mode:"business",environment:"production"});rpc.mockReset().mockResolvedValue(true);});
it("requires a client session and the private bank gate",async()=>{
 auth.mockResolvedValueOnce(null);expect((await PATCH(request({movementId:id,category:"Alimentação"}))).status).toBe(401);
 access.mockResolvedValueOnce(null);expect((await PATCH(request({movementId:id,category:"Alimentação"}))).status).toBe(404);expect(rpc).not.toHaveBeenCalled();
});
it("refuses cross-site changes before writing",async()=>{
 expect((await PATCH(request({movementId:id,category:"Alimentação"},"https://other.test"))).status).toBe(403);expect(rpc).not.toHaveBeenCalled();
});
it("accepts only valid movement ids and the user's available categories",async()=>{
 expect((await PATCH(request({movementId:"bad",category:"Alimentação"}))).status).toBe(400);
 expect((await PATCH(request({movementId:id,category:"Unknown"}))).status).toBe(400);
 expect((await PATCH(request({movementId:id,category:"Categoria especial"}))).status).toBe(200);
});
it("writes only category metadata with session-scoped user and mode",async()=>{
 expect((await PATCH(request({movementId:id,category:"Alimentação",userId:"other",amount:999}))).status).toBe(200);
 expect(rpc).toHaveBeenCalledWith({userId:"owner",mode:"business",environment:"production"},"zelo_of_set_movement_category",{p_movement:id,p_category:"Alimentação"});
});
it("can restore automatic categorization and handles a missing movement",async()=>{
 expect((await PATCH(request({movementId:id,category:null}))).status).toBe(200);
 rpc.mockResolvedValueOnce(false);expect((await PATCH(request({movementId:id,category:"Alimentação"}))).status).toBe(404);
});
it("does not claim success on a storage failure or expose the error",async()=>{
 rpc.mockRejectedValueOnce(Error("PRIVATE"));const response=await PATCH(request({movementId:id,category:"Alimentação"}));expect(response.status).toBe(503);expect(await response.text()).not.toContain("PRIVATE");
});
it("rejects oversized bodies",async()=>{
 expect((await PATCH(request({movementId:id,category:"x".repeat(10000)}))).status).toBe(400);expect(rpc).not.toHaveBeenCalled();
});
