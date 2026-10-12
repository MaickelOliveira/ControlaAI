import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ authenticate: vi.fn(), sign: vi.fn(), cookie: vi.fn() }));
vi.mock("@/lib/admin", () => ({ authenticateAdmin: mocks.authenticate, validateAdmin: async () => true }));
vi.mock("@/lib/auth", () => ({ signToken: mocks.sign, setAdminSessionCookie: mocks.cookie }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: async () => true }));
import { POST } from "./route";
const request = (body: unknown) => new NextRequest("https://zelo.example/api/admin/login", { method: "POST", body: JSON.stringify(body) });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.authenticate.mockResolvedValue("fixture-attested-version");
  mocks.sign.mockResolvedValue("fixture-session-cookie");
});
describe("administrative login boundary", () => {
  it("signs the version attested by password validation", async () => {
    expect((await POST(request({ email: "fixture-admin@example.test", password: "FixturePassword123" }))).status).toBe(200);
    expect(mocks.authenticate).toHaveBeenCalledWith("fixture-admin@example.test", "FixturePassword123");
    expect(mocks.sign).toHaveBeenCalledWith(expect.objectContaining({ sub: "admin", role: "admin" }), "fixture-attested-version");
  });
  it.each([
    { email: {}, password: "FixturePassword123" },
    { email: "fixture@example.test", password: {} },
    { email: "x".repeat(255), password: "FixturePassword123" },
    { email: "fixture@example.test", password: "x".repeat(129) },
  ])("rejects invalid credential shape or length before password checking", async body => {
    expect((await POST(request(body))).status).toBe(400);
    expect(mocks.authenticate).not.toHaveBeenCalled();
    expect(mocks.cookie).not.toHaveBeenCalled();
  });
  it("returns a generic failure without a cookie when credential storage is unavailable", async () => {
    mocks.authenticate.mockRejectedValue(new Error("fixture-sensitive-error"));
    const response = await POST(request({ email: "fixture-admin@example.test", password: "FixturePassword123" }));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("fixture-sensitive-error");
    expect(mocks.cookie).not.toHaveBeenCalled();
  });
});
