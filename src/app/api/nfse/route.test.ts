import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), rate: vi.fn(), overview: vi.fn(), profile: vi.fn(), service: vi.fn(), draft: vi.fn(), archive: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSessionWithUser: mocks.auth }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: mocks.rate }));
vi.mock("@/lib/nfse", () => ({ fiscalOverview: mocks.overview, saveFiscalProfile: mocks.profile, saveFiscalService: mocks.service, createFiscalDraft: mocks.draft, archiveFiscalRecord: mocks.archive }));
import { GET, POST } from "./route";
const identity = { session: { role: "client" }, user: { id: "owner", plan: "business", activeMode: "business", locale: "pt-BR" } };
function request(body: unknown, origin = "https://zelo.test") { return new Request("https://zelo.test/api/nfse", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
beforeEach(() => { vi.clearAllMocks(); mocks.auth.mockResolvedValue(identity); mocks.rate.mockResolvedValue(true); process.env.OPEN_FINANCE_APP_ORIGIN = "https://zelo.test"; });
it("requires Brazilian business mode before fiscal reads", async () => {
 for (const activeMode of ["personal", "business"]) {
  mocks.auth.mockResolvedValue({ ...identity, user: { ...identity.user, activeMode, locale: "es" } });
  expect((await GET()).status).toBe(403);
 }
 expect(mocks.overview).not.toHaveBeenCalled();
});
it("rejects foreign origins and oversized streamed payloads before writes", async () => {
 expect((await POST(request({action:"profile",profile:{}},"https://evil.test"))).status).toBe(403);
 expect((await POST(request({action:"profile",profile:{description:"x".repeat(33000)}}))).status).toBe(400);
 expect(mocks.profile).not.toHaveBeenCalled();
});
it("takes the owner from the session and cannot emit through an action injection", async () => {
 expect((await POST(request({action:"profile",userId:"other",companyId:"other",profile:{}}))).status).toBe(200);
 expect(mocks.profile).toHaveBeenCalledWith("owner",{});
 expect((await POST(request({action:"emit",id:"draft"}))).status).toBe(400);
 expect(mocks.draft).not.toHaveBeenCalled();
});
it("creates only a draft with server owned requester and source", async () => {
 mocks.draft.mockResolvedValue({ id:"draft",status:"draft" });
 const response = await POST(request({ action:"draft",draft:{},source:"whatsapp",requestedBy:"other" }));
 expect(response.status).toBe(201);
 expect(mocks.draft).toHaveBeenCalledWith("owner",{},"web","owner");
});
