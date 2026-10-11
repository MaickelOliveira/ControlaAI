import {afterEach,beforeEach,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
const m=vi.hoisted(()=>({auth:vi.fn(),offer:vi.fn(),origin:vi.fn(),rpc:vi.fn(),rate:vi.fn()}));
vi.mock("@/lib/auth",()=>({getSessionWithUser:m.auth}));
vi.mock("@/lib/open-finance-access",()=>({canEnrollOpenFinance:m.offer,requireOpenFinanceOrigin:m.origin}));
vi.mock("@/lib/supabase",()=>({getSupabase:()=>({rpc:m.rpc})}));
vi.mock("@/lib/rate-limit",()=>({checkRateLimit:m.rate}));
import {POST} from "./route";
const request=(body:unknown)=>new Request("https://zelo.test/api/open-finance/eligibility?mode=personal",{method:"POST",headers:{origin:"https://zelo.test","content-type":"application/json"},body:JSON.stringify(body)});
beforeEach(()=>{vi.resetAllMocks();m.auth.mockResolvedValue({session:{role:"client"},user:{id:"own-user",activeMode:"personal"}});m.offer.mockReturnValue(true);m.rate.mockResolvedValue(true);m.rpc.mockResolvedValue({data:true});});
afterEach(()=>vi.clearAllMocks());
it("records only the authenticated holder after explicit Brazilian confirmation",async()=>{
  expect((await POST(request({countryCode:"BR",confirmed:true,userId:"forged"}))).status).toBe(200);
  expect(m.rpc).toHaveBeenCalledWith("zelo_of_enable_brazil",{p_user:"own-user",p_mode:"personal",p_country:"BR",p_confirmed:true});
});
it.each([{countryCode:"PT",confirmed:true},{countryCode:"BR",confirmed:false},{}])("rejects non-Brazilian or absent confirmation %j",async body=>{
  expect((await POST(request(body))).status).toBe(400);expect(m.rpc).not.toHaveBeenCalled();
});
it("rejects admin, hidden rollout, cross-origin and rate-limited enrollment",async()=>{
  m.auth.mockResolvedValueOnce({session:{role:"admin"}});expect((await POST(request({}))).status).toBe(401);
  m.offer.mockReturnValueOnce(false);expect((await POST(request({}))).status).toBe(404);
  m.origin.mockImplementationOnce(()=>{throw Error();});expect((await POST(request({}))).status).toBe(403);
  m.rate.mockResolvedValueOnce(false);expect((await POST(request({}))).status).toBe(429);
  expect(m.rpc).not.toHaveBeenCalled();
});
