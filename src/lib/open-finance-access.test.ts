import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const rpc = vi.hoisted(() => vi.fn());
vi.mock("./supabase", () => ({ getSupabase: () => ({ rpc }) }));
import { getOpenFinanceAccess, requireOpenFinanceOrigin } from "./open-finance-access";

const owner = { id: "00000000-0000-4000-8000-000000000001", email: "owner@example.com", plan: "personal", activeMode: "personal" } as const;
function configured() {
  vi.stubEnv("OPEN_FINANCE_ENABLED", "true");
  vi.stubEnv("OPEN_FINANCE_OWNER_EMAIL", owner.email);
  vi.stubEnv("POLP_PRODUCTION_CLIENT_ID", "client-test");
  vi.stubEnv("POLP_PRODUCTION_CLIENT_SECRET", "secret-test");
}
afterEach(() => { vi.unstubAllEnvs(); rpc.mockReset(); });
describe("private Open Finance access", () => {
  it("defaults to hidden and makes no database call", async () => {
    vi.stubEnv("OPEN_FINANCE_ENABLED", "");
    expect(await getOpenFinanceAccess(owner)).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });
  it("cannot be enabled by a client-supplied email or locale", async () => {
    configured();
    expect(await getOpenFinanceAccess({ ...owner, email: "someone@example.com" })).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });
  it("requires verified Brazilian eligibility and fails closed on DB errors", async () => {
    configured();
    rpc.mockResolvedValueOnce({ data: { enabled: true, country_code: "PT", country_verified_at: "2026-10-09T12:00:00Z" } });
    expect(await getOpenFinanceAccess(owner)).toBeNull();
    rpc.mockResolvedValueOnce({ error: { message: "private details" } });
    expect(await getOpenFinanceAccess(owner)).toBeNull();
  });
  it("returns only the authenticated user scope and refuses unauthorized business mode", async () => {
    configured();
    rpc.mockResolvedValue({ data: { enabled: true, country_code: "BR", country_verified_at: "2026-10-09T12:00:00Z" } });
    expect(await getOpenFinanceAccess(owner, "personal")).toEqual({ userId: owner.id, mode: "personal", environment: "production" });
    expect(await getOpenFinanceAccess(owner, "business")).toBeNull();
    expect(await getOpenFinanceAccess(owner, "invalid")).toBeNull();
  });
  it("requires a same-origin mutation rather than trusting forwarded headers", () => {
    expect(() => requireOpenFinanceOrigin(new Request("https://zelo.example/api/open-finance", { method: "POST", headers: { origin: "https://attacker.example", "x-forwarded-host": "attacker.example" } }))).toThrow();
    expect(() => requireOpenFinanceOrigin(new Request("https://zelo.example/api/open-finance", { method: "POST" }))).toThrow();
    expect(() => requireOpenFinanceOrigin(new Request("https://zelo.example/api/open-finance", { method: "POST", headers: { origin: "https://zelo.example" } }))).not.toThrow();
  });
  it("allows the verified owner's business preview only with its explicit private flag", async () => {
    configured();
    vi.stubEnv("OPEN_FINANCE_PREVIEW_ONLY", "true");
    vi.stubEnv("OPEN_FINANCE_PREVIEW_BUSINESS_ENABLED", "true");
    rpc.mockResolvedValue({ data: { enabled: true, country_code: "BR", country_verified_at: "2026-10-09T12:00:00Z" } });
    expect(await getOpenFinanceAccess(owner, "business")).toEqual({ userId: owner.id, mode: "business", environment: "production" });
    expect(await getOpenFinanceAccess({ ...owner, email: "another@example.com" }, "business")).toBeNull();
    vi.stubEnv("OPEN_FINANCE_PREVIEW_ONLY", "false");
    expect(await getOpenFinanceAccess(owner, "business")).toBeNull();
    vi.stubEnv("OPEN_FINANCE_PREVIEW_ONLY", "true");
    vi.stubEnv("OPEN_FINANCE_PREVIEW_BUSINESS_ENABLED", "");
    expect(await getOpenFinanceAccess(owner, "business")).toBeNull();
  });
  it("does not bypass Brazilian eligibility for the business preview", async () => {
    configured();
    vi.stubEnv("OPEN_FINANCE_PREVIEW_ONLY", "true");
    vi.stubEnv("OPEN_FINANCE_PREVIEW_BUSINESS_ENABLED", "true");
    rpc.mockResolvedValue({ data: { enabled: true, country_code: "PT", country_verified_at: "2026-10-09T12:00:00Z" } });
    expect(await getOpenFinanceAccess(owner, "business")).toBeNull();
  });
  it("preserves business plan access without the private preview exception", async () => {
    configured();
    vi.stubEnv("OPEN_FINANCE_PREVIEW_ONLY", "false");
    vi.stubEnv("OPEN_FINANCE_PREVIEW_BUSINESS_ENABLED", "");
    rpc.mockResolvedValue({ data: { enabled: true, country_code: "BR", country_verified_at: "2026-10-09T12:00:00Z" } });
    expect(await getOpenFinanceAccess({ ...owner, plan: "business" }, "business")).toEqual({ userId: owner.id, mode: "business", environment: "production" });
  });
});
