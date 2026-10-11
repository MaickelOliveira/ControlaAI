import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ overview: vi.fn(), create: vi.fn(), pending: vi.fn(), clear: vi.fn(), send: vi.fn(), access: vi.fn() }));
vi.mock("./nfse", () => ({ fiscalOverview: mocks.overview, createFiscalDraft: mocks.create }));
vi.mock("./pending-actions", () => ({ setPendingAction: mocks.pending, clearPendingAction: mocks.clear }));
vi.mock("./whatsapp", () => ({ sendText: mocks.send }));
vi.mock("./wpp-phone-links", () => ({ getPhoneAccess: mocks.access }));
import { handleFiscalWhatsApp } from "./nfse-whatsapp";
const user = { id: "owner", plan: "business", locale: "pt-BR" } as Parameters<typeof handleFiscalWhatsApp>[0];
beforeEach(() => { vi.clearAllMocks(); mocks.access.mockResolvedValue("business"); mocks.overview.mockResolvedValue({ profile: { legalName: "Empresa" }, services: [{ id: "service", service: { title: "Consultoria", amount: 150 } }], drafts: [] }); });
it("does not intercept ordinary financial registrations mentioning an invoice", async () => {
 expect(await handleFiscalWhatsApp(user, "business", "phone", "gastei 50 com uma nota fiscal", null)).toBe(false);
 expect(mocks.overview).not.toHaveBeenCalled();
});
it("blocks personal/unlinked numbers before any fiscal lookup", async () => {
 mocks.access.mockResolvedValue("personal");
 expect(await handleFiscalWhatsApp(user, "business", "phone", "emita uma nota fiscal", null)).toBe(true);
 expect(mocks.overview).not.toHaveBeenCalled();
});
it("starts a company-bound draft and never announces a fiscal document as issued", async () => {
 expect(await handleFiscalWhatsApp(user, "business", "phone", "emita uma nota fiscal", null)).toBe(true);
 expect(mocks.pending).toHaveBeenCalledWith("phone", expect.objectContaining({ type: "nfse_draft", userId: "owner", stage: "service" }));
 expect(mocks.send.mock.calls[0][1]).toContain("rascunho");
 expect(mocks.create).not.toHaveBeenCalled();
});
it("bounds the service list and starts emission requests that also ask for sending", async () => {
 const overview = await mocks.overview(); overview.services = Array.from({ length: 200 }, (_, i) => ({ id: String(i), service: { title: "s".repeat(100), amount: 150 } }));
 expect(await handleFiscalWhatsApp(user, "business", "phone", "emita uma nota fiscal e envie", null)).toBe(true);
 expect(mocks.send.mock.calls[0][1].length).toBeLessThan(3000);
 expect(mocks.pending).toHaveBeenCalledWith("phone", expect.objectContaining({ stage: "service" }));
});
it("keeps an invalid service answer in its current stage for correction", async () => {
 await handleFiscalWhatsApp(user, "business", "phone", "1234", { type: "nfse_draft", userId: user.id, phone: "phone", expiresAt: new Date(Date.now() + 60_000).toISOString(), stage: "new_service", newField: "nationalCode", newService: { title: "Consultoria" } });
 expect(mocks.pending).not.toHaveBeenCalled();
 expect(mocks.send.mock.calls[0][1]).toContain("6 dígitos");
});
it("clears an invisible continuation after a failed message delivery", async () => {
 mocks.send.mockResolvedValueOnce(false);
 await handleFiscalWhatsApp(user, "business", "phone", "prepare uma nota fiscal", null);
 expect(mocks.clear).toHaveBeenCalledWith("phone");
});
it("does not advance past an oversized replacement amount", async () => {
 await handleFiscalWhatsApp(user, "business", "phone", "1000000000000", { type: "nfse_draft", userId: user.id, phone: "phone", expiresAt: new Date(Date.now() + 60_000).toISOString(), stage: "amount", serviceId: "service" });
 expect(mocks.pending).not.toHaveBeenCalled();
 expect(mocks.send.mock.calls[0][1]).toContain("valor do serviço");
});
