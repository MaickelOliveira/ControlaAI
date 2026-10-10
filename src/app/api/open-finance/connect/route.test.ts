import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ scope: vi.fn(), rpc: vi.fn(), banks: vi.fn(), create: vi.fn() }));
vi.mock("@/lib/open-finance-http", () => ({ openFinanceRequestScope: m.scope, openFinanceRpc: m.rpc, OF_HEADERS: { "Cache-Control": "private, no-store" } }));
vi.mock("@/lib/open-finance-institutions", () => ({ getBankInstitutions: m.banks }));
vi.mock("@/lib/open-finance-ready", () => ({ isBankConnectReady:vi.fn(async()=>true) }));
vi.mock("@/lib/open-finance-sync", () => ({ enqueueConsentCheck:vi.fn(async()=>{}) }));
vi.mock("@/lib/polp-production", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/polp-production")>(), createProductionConsent: m.create }));
import { POST } from "./route";
const id = "550e8400-e29b-41d4-a716-446655440000";
function request(body: unknown) { return new Request("https://zelo.example/api/open-finance/connect", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }); }
beforeEach(() => {
  vi.stubEnv("OPEN_FINANCE_CONNECT_ENABLED", "true");
  vi.stubEnv("OPEN_FINANCE_AUTH_HOSTS", "authorize.example");
  m.scope.mockResolvedValue({ userId: id, mode: "personal", environment: "production" });
  m.banks.mockResolvedValue([{ id, name: "Bank", status: "OPERATIONAL", type: "PERSONAL" }]);
  m.create.mockResolvedValue({ id, status: "AWAITING_AUTHORIZATION", products: ["ACCOUNT"], url_to_authenticate: "https://authorize.example/oauth" });
  m.rpc.mockResolvedValue({ id });
});
afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });
describe("real bank connection", () => {
  it("requires completed terms and never sends documents for an ineligible institution", async () => {
    expect((await POST(request({ institutionId: id, cpf: "52998224725" }))).status).toBe(400);
    m.banks.mockResolvedValue([{ id, status: "MAJOR_OUTAGE", type: "PERSONAL" }]);
    expect((await POST(request({ institutionId: id, cpf: "52998224725", acceptedTerms: true, journeyVersion: "celcoin-2026-10" }))).status).toBe(400);
    expect(m.create).not.toHaveBeenCalled();
  });
  it("uses authenticated ownership, stores no documents, and returns only the authorization link", async () => {
    const response = await POST(request({ institutionId: id, cpf: "52998224725", userId: "attacker", acceptedTerms: true, journeyVersion: "celcoin-2026-10" }));
    expect(response.status).toBe(201);
    expect(m.create).toHaveBeenCalledWith(id, id, { cpf: "52998224725" });
    expect(JSON.stringify(m.rpc.mock.calls)).not.toContain("52998224725");
    const result = await response.json();
    expect(result).toEqual({ id, authorizationUrl: "https://authorize.example/oauth" });
  });
});
