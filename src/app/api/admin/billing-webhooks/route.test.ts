import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("server-only", () => ({}));

vi.mock("@/lib/auth", () => ({ getAdminSession: vi.fn(async () => ({ role: "admin" })) }));
vi.mock("@/lib/billing-webhooks", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/billing-webhooks")>();
  return { ...actual, getBillingWebhooks: vi.fn(), getBillingWebhookById: vi.fn(), createBillingWebhook: vi.fn(), updateBillingWebhook: vi.fn(), evaluateBillingWebhook: vi.fn() };
});
import { createBillingWebhook, getBillingWebhooks, getBillingWebhookById, updateBillingWebhook, evaluateBillingWebhook, type BillingWebhookConfig } from "@/lib/billing-webhooks";
import { GET, POST } from "./route";
import { PATCH } from "./[id]/route";
const cfg: BillingWebhookConfig = { id: "fake-webhook", label: "Test", active: false, secretValue: "fake-secret", emailPath: "email", statusPath: "status", activateValues: [], deactivateValues: [], createdAt: "2026-10-12T00:00:00Z",
  lastAttempt: { at: "2026-10-12T01:00:00Z", wasActive: true, authOk: true, body: { email: "person@example.test", status: "paid", token: "fake-token" } } };

describe("billing admin credential response boundary", () => {
  beforeEach(() => { vi.mocked(createBillingWebhook).mockResolvedValue(cfg); vi.mocked(updateBillingWebhook).mockResolvedValue(cfg); vi.mocked(getBillingWebhooks).mockResolvedValue([cfg]); vi.mocked(getBillingWebhookById).mockResolvedValue(cfg); });
  it.each(["GET", "POST", "PATCH"])("%s masks the stored credential and strips raw webhook tokens", async method => {
    const req = new NextRequest("https://zelo.example.test/api/admin/billing-webhooks", { method: method === "GET" ? "GET" : method, headers: { "Content-Type": "application/json" }, ...(method === "GET" ? {} : { body: JSON.stringify({ label: "Test", emailPath: "email", statusPath: "status", secretValue: "fake-secret" }) }) });
    const response = method === "GET" ? await GET() : method === "POST" ? await POST(req) : await PATCH(req, { params: Promise.resolve({ id: cfg.id }) });
    const body = await response.json();
    expect(method === "GET" ? body.configs[0].secretValue : body.secretValue).toBe("••••••••");
    expect(JSON.stringify(body)).not.toContain("fake-secret");
    expect(JSON.stringify(body)).not.toContain("fake-token");
  });
  it("preserves the saved credential when the editing form sends the mask", async () => {
    const request = new NextRequest("https://zelo.example.test/api/admin/billing-webhooks/fake-webhook", { method: "PATCH", body: JSON.stringify({ secretValue: "••••••••", active: true }), headers: { "Content-Type": "application/json" } });
    await PATCH(request, { params: Promise.resolve({ id: cfg.id }) });
    expect(updateBillingWebhook).toHaveBeenLastCalledWith(cfg.id, { active: true, secretValue: undefined });
  });
  it("filters credential reflections from a dry-run diagnostic result", async () => {
    vi.mocked(evaluateBillingWebhook).mockResolvedValue({ ok: true, action: "ignored", detail: "unmapped status fake-secret" });
    const request = new NextRequest("https://zelo.example.test/api/admin/billing-webhooks/fake-webhook", { method: "PATCH", body: JSON.stringify({ action: "test", payload: '{"status":"paid"}' }), headers: { "Content-Type": "application/json" } });
    const body = await (await PATCH(request, { params: Promise.resolve({ id: cfg.id }) })).json();
    expect(body.action).toBe("ignored");
    expect(JSON.stringify(body)).not.toContain("fake-secret");
  });
});
