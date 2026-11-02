import {beforeEach,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
const m=vi.hoisted(()=>({scope:vi.fn(),read:vi.fn(),rate:vi.fn()}));
vi.mock("@/lib/open-finance-http",()=>({openFinanceRequestScope:m.scope,OF_HEADERS:{"Cache-Control":"private, no-store"}}));
vi.mock("@/lib/open-finance-sync-status",()=>({readProductionSyncStatus:m.read}));
vi.mock("@/lib/rate-limit",()=>({checkRateLimit:m.rate}));
import {GET} from "./route";
const id="00000000-0000-4000-8000-000000000001",scope={userId:id,mode:"personal",environment:"production"};
const request=()=>GET(new Request(`https://zelo.test/api/open-finance/connections/${id}/sync-status`),{params:Promise.resolve({id})});
beforeEach(()=>{vi.resetAllMocks();m.scope.mockResolvedValue(scope);m.rate.mockResolvedValue(true);m.read.mockResolvedValue({items:[]});});
it("requires a scoped identity and rate-limits provider diagnostics",async()=>{
 m.scope.mockResolvedValueOnce(new Response(null,{status:403}));expect((await request()).status).toBe(403);expect(m.read).not.toHaveBeenCalled();
 m.rate.mockResolvedValueOnce(false);expect((await request()).status).toBe(429);expect(m.read).not.toHaveBeenCalled();
});
it("reads only through the authorized scope, disables caching and sanitizes provider failures",async()=>{
 const response=await request();expect(response.status).toBe(200);expect(response.headers.get("Cache-Control")).toBe("private, no-store");expect(m.read).toHaveBeenCalledWith(scope,id);
 m.read.mockRejectedValueOnce(Error("private-provider-error"));const failed=await request();expect(failed.status).toBe(503);expect(await failed.text()).not.toContain("private-provider-error");
});
