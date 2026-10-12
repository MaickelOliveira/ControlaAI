import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ session: vi.fn(), validate: vi.fn(), save: vi.fn(), clear: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getAdminSession: mocks.session, clearAdminSession: mocks.clear }));
vi.mock("@/lib/admin", () => ({ validateAdmin: mocks.validate, setAdminPassword: mocks.save }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: async () => true }));
import { POST } from "./route";
const body = { email: "fixture-admin@example.test", currentPassword: "FixtureCurrentPassword12", newPassword: "FixtureNextPassword123" };
const request = (value: unknown) => new NextRequest("https://zelo.example/api/admin/change-password", { method: "POST", body: JSON.stringify(value) });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ role: "admin", email: body.email });
  mocks.validate.mockResolvedValue(true);
  mocks.save.mockResolvedValue(undefined);
});
describe("admin password change persistence", () => {
  it("clears the now-revoked cookie after a successful credential change", async () => {
    expect((await POST(request(body))).status).toBe(200);
    expect(mocks.clear).toHaveBeenCalledOnce();
  });
  it("does not report success or clear the cookie when credential saving fails", async () => {
    mocks.save.mockRejectedValue(new Error("fixture-sensitive-error"));
    const response = await POST(request(body));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("fixture-sensitive-error");
    expect(mocks.clear).not.toHaveBeenCalled();
  });
  it.each([
    { ...body, email: {} }, { ...body, currentPassword: {} }, { ...body, newPassword: {} },
    { ...body, email: "x".repeat(255) }, { ...body, newPassword: "x".repeat(129) },
  ])("rejects malformed or oversized credentials before checking or saving", async input => {
    expect((await POST(request(input))).status).toBe(400);
    expect(mocks.validate).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });
});
