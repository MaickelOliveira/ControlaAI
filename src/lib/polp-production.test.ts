import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createProductionConsent, polpProductionPage, requireAuthUrl, validateBankDocuments } from "./polp-production";
const id = "550e8400-e29b-41d4-a716-446655440000";
const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  vi.stubEnv("OPEN_FINANCE_ENABLED", "true");
  vi.stubEnv("POLP_PRODUCTION_CLIENT_ID", "production-client");
  vi.stubEnv("POLP_PRODUCTION_CLIENT_SECRET", "production-secret");
  vi.stubEnv("POLP_SANDBOX_CLIENT_SECRET", "sandbox-secret");
  vi.stubEnv("OPEN_FINANCE_AUTH_HOSTS", "authorize.example");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("real consent boundary", () => {
  it("validates CPF check digits and requires company document in business mode", () => {
    expect(validateBankDocuments("529.982.247-25", undefined, "personal")).toEqual({ cpf: "52998224725" });
    expect(() => validateBankDocuments("11111111111", undefined, "personal")).toThrow();
    expect(() => validateBankDocuments("52998224725", undefined, "business")).toThrow();
    expect(() => validateBankDocuments("52998224725", "11222333000181", "personal")).toThrow();
  });
  it("never falls back to sandbox credentials", async () => {
    vi.stubEnv("POLP_PRODUCTION_CLIENT_SECRET", "");
    await expect(createProductionConsent(id, id, { cpf: "52998224725" })).rejects.toThrow("NOT_CONFIGURED");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("correlates with server UUID and declines a consent belonging to another client", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: { id, cliente_user_id: "someone-else", institution_id: id, status: "AWAITING_AUTHORIZATION" } }), { status: 201 }));
    await expect(createProductionConsent(id, id, { cpf: "52998224725" })).rejects.toThrow("CONSENT_IDENTITY_MISMATCH");
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.polp.com.br/api/v2/consents");
    expect(options?.headers).toMatchObject({ "x-api-secret": "production-secret" });
    expect(JSON.parse(String(options?.body))).toMatchObject({ cliente_user_id: id, avoidDuplicates: true });
  });
  it("uses a fixed host and validates cursor data without exposing provider errors", async () => {
    await expect(polpProductionPage("https://attacker.example", null)).rejects.toThrow("INVALID_PATH");
    await expect(polpProductionPage(`/consents/${id}/accounts`, "x".repeat(1001))).rejects.toThrow("INVALID_CURSOR");
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockResolvedValue(new Response("private token secret CPF", { status: 403 }));
    await expect(polpProductionPage(`/consents/${id}/accounts`, null)).rejects.toThrow("POLP_HTTP_403");
  });
  it("accepts documented opaque investment ids while rejecting path traversal", async () => {
    const opaqueId = "92792126019929200000000000000000000000000";
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: [], meta: { next_cursor: null } })));
    expect(await polpProductionPage(`/funds/${opaqueId}/transactions`, null)).toEqual({ data: [], nextCursor: null });
    await expect(polpProductionPage("/accounts/../loans", null)).rejects.toThrow("INVALID_PATH");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("permits only configured HTTPS authorization hosts without userinfo", () => {
    expect(requireAuthUrl("https://authorize.example/oauth?state=opaque")).toContain("https://authorize.example/");
    for (const url of ["javascript:alert(1)", "https://authorize.example.attacker.test/", "https://user:password@authorize.example/", "http://authorize.example/"]) {
      expect(() => requireAuthUrl(url)).toThrow("INVALID_AUTH_URL");
    }
  });
});
