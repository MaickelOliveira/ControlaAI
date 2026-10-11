import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), session: vi.fn(), rate: vi.fn(), find: vi.fn(), store: vi.fn(), save: vi.fn(), remove: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSession: mocks.session, getSessionWithUser: mocks.auth }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: mocks.rate }));
vi.mock("@/lib/grocery", async original => ({ ...await original<typeof import("@/lib/grocery")>(), getGroceryPurchase: mocks.find, findOrCreateStore: mocks.store, saveGroceryPurchase: mocks.save, deleteGroceryPurchase: mocks.remove }));
import { POST } from "./route";
const identity = { session: { role: "client", sub: "owner" }, user: { activeMode: "personal" } };
const purchase = { action: "purchase", operationKey: "10000000-0000-4000-8000-000000000001", storeName: "Mercado", date: "2026-10-11", items: [{ productName: "Arroz", price: 8.5, quantity: 1.5, unit: "kg" }] };
const request = (body: unknown, origin = "https://zelo.test") => new NextRequest("https://zelo.test/api/admin/grocery", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
beforeEach(() => { vi.clearAllMocks(); mocks.auth.mockResolvedValue(identity); mocks.rate.mockResolvedValue(true); mocks.store.mockResolvedValue({ id: "store", name: "Mercado" }); mocks.save.mockResolvedValue({ id: "purchase" }); process.env.OPEN_FINANCE_APP_ORIGIN = "https://zelo.test"; });
it("blocks missing authentication, another role, business mode and foreign origins before writes", async () => {
 for (const auth of [null, { ...identity, session: { role: "admin", sub: "owner" } }, { ...identity, user: { activeMode: "business" } }]) {
  mocks.auth.mockResolvedValue(auth); expect((await POST(request(purchase))).status).toBeGreaterThanOrEqual(401);
 }
 mocks.auth.mockResolvedValue(identity); expect((await POST(request(purchase, "https://evil.test"))).status).toBe(403);
 expect(mocks.store).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
});
it("rejects incomplete, oversized and invalid quantities without any write", async () => {
 for (const body of [[], { ...purchase, storeName: "x".repeat(100001) }, { ...purchase, items: [...purchase.items, { productName: "", price: 2, quantity: 1 }] }, { ...purchase, items: [{ ...purchase.items[0], quantity: 0 }] }]) expect((await POST(request(body))).status).toBe(400);
 expect(mocks.store).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
});
it("ignores injected owner/company/source and preserves fractions and retry key", async () => {
 expect((await POST(request({ ...purchase, userId: "other", companyId: "foreign", source: "whatsapp", registeredBy: "other" }))).status).toBe(201);
 expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ userId: "owner", total: 12.75, items: [expect.objectContaining({ quantity: 1.5 })] }), { mode: "personal", source: "web", registeredBy: "owner" }, undefined, { key: `web:${purchase.operationKey}` });
});
it("checks owned scoped purchase before editing and requires explicit deletion confirmation", async () => {
 mocks.find.mockResolvedValue(null);
 expect((await POST(request({ ...purchase, action: "purchase_update", id: "foreign" }))).status).toBe(404);
 expect(mocks.store).not.toHaveBeenCalled();
 expect((await POST(request({ action: "purchase_delete", id: "owned" }))).status).toBe(400); expect(mocks.remove).not.toHaveBeenCalled();
 mocks.remove.mockResolvedValue(false);
 expect((await POST(request({ action: "purchase_delete", id: "foreign", confirm: true }))).status).toBe(404);
 mocks.remove.mockResolvedValue(true);
 expect((await POST(request({ action: "purchase_delete", id: "owned", confirm: true }))).status).toBe(200);
 expect(mocks.remove).toHaveBeenLastCalledWith("owner", "owned");
});
it("keeps the edit modal actionable when a write fails", async () => {
 mocks.find.mockResolvedValue({ id: "owned" }); mocks.save.mockRejectedValue(Error("Não foi possível salvar a compra."));
 const response = await POST(request({ ...purchase, action: "purchase_update", id: "owned" }));
 expect(response.status).toBe(400); expect((await response.json()).error).toContain("Não foi possível");
});
