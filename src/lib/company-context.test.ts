import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => { throw Error("outside request"); } }));
vi.mock("./auth", () => ({ getAdminSession: vi.fn(), getSessionWithUser: vi.fn() }));
vi.mock("./companies", () => ({ multiCompanyEnabled: () => process.env.MULTI_COMPANY_ENABLED === "true", requireCompany: vi.fn(), COMPANY_COOKIE: "zelo_company" }));
beforeEach(() => vi.stubEnv("MULTI_COMPANY_ENABLED", "true"));
afterEach(() => vi.unstubAllEnvs());
it("blocks absent or unidentified context and permits only an explicit trusted job", async () => {
  const context = await import("./company-context");
  await expect(context.resolveCompanyContext()).rejects.toThrow("COMPANY_CONTEXT_MISSING");
  await expect(context.runWithCompanyContext(() => context.resolveCompanyContext())).rejects.toThrow("COMPANY_CONTEXT_MISSING");
  expect(await context.runWithTrustedCompanyJob(() => context.resolveCompanyContext())).toEqual({ trusted: true });
});
it("keeps concurrent participants independent and shares context across module bundles", async () => {
  const first = await import("./company-context");
  vi.resetModules(); const second = await import("./company-context");
  const scopes = ["a", "b"].map(companyId => ({ userId: "owner", companyId, mode: "business" as const }));
  const results = await Promise.all(scopes.map(scope => first.runWithCompanyContext(async () => {
    first.setCompanyContext(scope); await Promise.resolve(); return second.resolveCompanyContext();
  })));
  expect(results).toEqual(scopes);
  expect(second.currentCompanyContext()).toBeUndefined();
});
