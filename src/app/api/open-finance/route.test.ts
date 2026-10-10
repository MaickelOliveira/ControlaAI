import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ auth: vi.fn(), access: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSessionWithUser: mocks.auth }));
vi.mock("@/lib/open-finance-access", () => ({ getOpenFinanceAccess: mocks.access }));
vi.mock("@/lib/supabase", () => ({ getSupabase: () => ({ rpc: mocks.rpc }) }));
import { GET } from "./route";
afterEach(() => vi.clearAllMocks());
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
});
