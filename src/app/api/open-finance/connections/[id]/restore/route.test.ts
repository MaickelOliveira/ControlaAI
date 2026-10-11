import {beforeEach,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
const m=vi.hoisted(()=>({scope:vi.fn(),rpc:vi.fn(),rate:vi.fn()}));
vi.mock("@/lib/open-finance-http",()=>({openFinanceRequestScope:m.scope,openFinanceRpc:m.rpc,OF_HEADERS:{"Cache-Control":"private, no-store"}}));
vi.mock("@/lib/rate-limit",()=>({checkRateLimit:m.rate}));
import {POST} from "./route";
const id="550e8400-e29b-41d4-a716-446655440000",scope={userId:id,mode:"personal",environment:"production"};
const request=(target=id)=>POST(new Request(`https://zelo.test/api/open-finance/connections/${target}/restore`,{method:"POST"}),{params:Promise.resolve({id:target})});
beforeEach(()=>{vi.resetAllMocks();m.scope.mockResolvedValue(scope);m.rate.mockResolvedValue(true);});
it("requires identity and origin and validates the connection id",async()=>{
  m.scope.mockResolvedValueOnce(new Response(null,{status:403}));expect((await request()).status).toBe(403);expect((await request('bad')).status).toBe(503);expect(m.rpc).not.toHaveBeenCalled();
});
it("restores only visibility, never consent status or provider access",async()=>{
  expect((await request()).status).toBe(200);expect(m.scope).toHaveBeenCalledWith(expect.any(Request),true);expect(m.rpc).toHaveBeenCalledWith(scope,"zelo_of_connection_visibility",{p_id:id,p_archived:false});
});
