import {beforeEach,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
const m=vi.hoisted(()=>({auth:vi.fn(),access:vi.fn(),rpc:vi.fn()}));
vi.mock("@/lib/auth",()=>({getSessionWithUser:m.auth}));
vi.mock("@/lib/open-finance-access",()=>({getOpenFinanceAccess:m.access}));
vi.mock("@/lib/supabase",()=>({getSupabase:()=>({rpc:m.rpc})}));
vi.mock("@/lib/rate-limit",()=>({checkRateLimit:async()=>true}));
import {GET} from "./route";
const id="00000000-0000-4000-8000-000000000001",scope={userId:"own",mode:"personal",environment:"production"};
const request=()=>new Request("https://zelo.example/api/open-finance/bills/"+id+"?mode=personal&userId=foreign");
const context={params:Promise.resolve({id})};
beforeEach(()=>{vi.resetAllMocks();m.auth.mockResolvedValue({session:{role:"client"},user:{id:"own"}});m.access.mockResolvedValue(scope);m.rpc.mockResolvedValue({error:null,data:{bill:{id,resource_id:"card",institution_name:"Test bank",resource_name:"Card",due_date:"2026-10-15",currency:"BRL",total_amount:"100",minimum_payment_amount:null,payment_evidence:false,payment_amount:null,synced_at:"2026-10-11T10:00:00Z"},transactions:[],transactions_complete:false,next:null}});});
it("requires a client session before reading or generating any document",async()=>{
  m.auth.mockResolvedValue(null);expect((await GET(request(),context)).status).toBe(401);expect(m.rpc).not.toHaveBeenCalled();
  m.auth.mockResolvedValue({session:{role:"admin"},user:{id:"own"}});expect((await GET(request(),context)).status).toBe(401);expect(m.rpc).not.toHaveBeenCalled();
});
it("uses only the session holder and requested eligible mode, with private no-store PDF headers",async()=>{
  const response=await GET(request(),context);expect(response.status).toBe(200);expect(response.headers.get("content-type")).toBe("application/pdf");expect(response.headers.get("cache-control")).toContain("no-store");expect(response.headers.get("content-disposition")).toContain("attachment");expect(Buffer.from(await response.arrayBuffer()).subarray(0,8).toString()).toBe("%PDF-1.4");
  expect(m.rpc).toHaveBeenCalledWith("zelo_of_bill",{p_user:"own",p_mode:"personal",p_bill:id,p_after:null});
});
it("never returns a PDF or financial details on cross-holder or wrong-mode denial",async()=>{
  m.rpc.mockResolvedValue({error:{message:"OF_BILL_NOT_FOUND private data"},data:null});const response=await GET(request(),context);expect(response.status).toBe(503);expect(response.headers.get("content-type")).not.toBe("application/pdf");expect(await response.text()).not.toContain("private data");
});
