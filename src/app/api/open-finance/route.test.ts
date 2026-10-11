import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ auth: vi.fn(), access: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSessionWithUser: mocks.auth }));
vi.mock("@/lib/open-finance-access", () => ({ getOpenFinanceAccess: mocks.access,canEnrollOpenFinance:()=>false,isPublicOpenFinanceEnabled:()=>false }));
vi.mock("@/lib/supabase", () => ({ getSupabase: () => ({ rpc: mocks.rpc }) }));
import { GET } from "./route";
afterEach(() => {vi.clearAllMocks();vi.unstubAllEnvs();});
describe("Open Finance overview authorization", () => {
  it("rejects anonymous and admin sessions before touching financial storage", async () => {
    mocks.auth.mockResolvedValueOnce(null);
    expect((await GET(new Request("https://zelo.example/api/open-finance"))).status).toBe(401);
    mocks.auth.mockResolvedValueOnce({ session: { role: "admin" }, user: {} });
    expect((await GET(new Request("https://zelo.example/api/open-finance"))).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("hides the feature from ineligible users", async () => {
    mocks.auth.mockResolvedValue({ session: { role: "client" }, user: {} });
    mocks.access.mockResolvedValue(null);
    expect((await GET(new Request("https://zelo.example/api/open-finance"))).status).toBe(404);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("ignores a forged user id and disables caching", async () => {
    mocks.auth.mockResolvedValue({ session: { role: "client" }, user: { id: "owner" } });
    mocks.access.mockResolvedValue({ userId: "owner", environment: "production", mode: "personal" });
    mocks.rpc.mockResolvedValue({ data: { connections: [], resources: [] } });
    const response = await GET(new Request("https://zelo.example/api/open-finance?userId=someone-else&mode=personal"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.rpc).toHaveBeenCalledWith("zelo_of_overview", { p_user: "owner", p_environment: "production", p_mode: "personal" });
  });
  it("uses the selected second company instead of the legacy default",async()=>{
    vi.stubEnv("MULTI_COMPANY_ENABLED","true");
    mocks.auth.mockResolvedValue({session:{role:"client"},user:{id:"owner"}});
    mocks.access.mockResolvedValue({userId:"owner",environment:"production",mode:"business",companyId:"company-two"});
    const setHeader=vi.fn();const query={setHeader,then:(resolve:(v:unknown)=>unknown)=>Promise.resolve({data:{connections:[{id:"second-bank"}],resources:[]}}).then(resolve)};setHeader.mockReturnValue(query);mocks.rpc.mockReturnValue(query);
    const response=await GET(new Request("https://zelo.example/api/open-finance?mode=business&companyId=forged"));
    expect(response.status).toBe(200);expect((await response.json()).connections[0].id).toBe("second-bank");
    expect(setHeader).toHaveBeenCalledWith("x-zelo-company","company-two");expect(setHeader).toHaveBeenCalledWith("x-zelo-owner","owner");
  });
});
