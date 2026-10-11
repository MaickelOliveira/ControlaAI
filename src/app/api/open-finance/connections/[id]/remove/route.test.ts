import {beforeEach,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
const m=vi.hoisted(()=>({scope:vi.fn(),remove:vi.fn(),rate:vi.fn()}));
vi.mock("@/lib/open-finance-http",()=>({openFinanceRequestScope:m.scope,OF_HEADERS:{"Cache-Control":"private, no-store"}}));
vi.mock("@/lib/open-finance-connections",()=>({removeBankAttempt:m.remove}));
vi.mock("@/lib/rate-limit",()=>({checkRateLimit:m.rate}));
import {POST} from "./route";
const id="550e8400-e29b-41d4-a716-446655440000",scope={userId:id,mode:"business",environment:"production"};
const request=()=>POST(new Request(`https://zelo.test/api/open-finance/connections/${id}/remove`,{method:"POST"}),{params:Promise.resolve({id})});
beforeEach(()=>{vi.resetAllMocks();m.scope.mockResolvedValue(scope);m.rate.mockResolvedValue(true);});
it("does nothing without authorized identity and origin or when throttled",async()=>{
  for(const status of [401,403,404]){m.scope.mockResolvedValueOnce(new Response(null,{status}));expect((await request()).status).toBe(status);}
  m.rate.mockResolvedValueOnce(false);expect((await request()).status).toBe(429);expect(m.remove).not.toHaveBeenCalled();
});
it("uses the authenticated holder and mode and returns a private response",async()=>{
  const response=await request();expect(response.status).toBe(200);expect(m.scope).toHaveBeenCalledWith(expect.any(Request),true);expect(m.remove).toHaveBeenCalledWith(scope,id);expect(response.headers.get('cache-control')).toBe('private, no-store');
});
it("does not claim successful removal on a provider or storage failure",async()=>{
  m.remove.mockRejectedValueOnce(Error("private identifier"));const response=await request();expect(response.status).toBe(503);expect(await response.text()).not.toContain("private identifier");
});
