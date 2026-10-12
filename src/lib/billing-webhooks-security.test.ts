import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

const storage = vi.hoisted(() => ({ row: null as Record<string, unknown> | null, saved: null as Record<string, unknown> | null }));
vi.mock("./supabase", () => ({ getSupabase: () => ({ from: () => ({
  select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: storage.row }) }) }),
  update: (value: Record<string, unknown>) => { storage.saved = value; return { eq: async () => ({ error: null }) }; },
}) }) }));
vi.mock("./crypto-store", () => ({ encryptField: (v: string) => v, decryptField: (v: string) => v }));
import { billingWebhookAdminView, getBillingWebhookById, recordWebhookAttempt, type BillingWebhookConfig } from "./billing-webhooks";

const cfg: BillingWebhookConfig = {
  id: "fake-webhook", label: "Kiwify", active: true, secretValue: "fake-billing-secret", secretBodyField: "credentials.magic",
  emailPath: "Customer.email", statusPath: "order_status", planPath: "Product.id", activateValues: ["paid"], deactivateValues: ["refunded"], createdAt: "2026-10-12T00:00:00Z",
};
const attempt = {
  at: "2026-10-12T01:00:00Z", wasActive: true, authOk: true,
  body: { order_status: "paid", Customer: { email: "person@example.test", password: "fake-password" }, Product: { id: "plan-1" }, credentials: { magic: cfg.secretValue }, token: "fake-token", opaque: "fake-private-value" },
};

describe("billing diagnostic secret protection", () => {
  beforeEach(() => { storage.saved = null; storage.row = null; });

  it("stores only bounded mapped diagnostic fields, never the authentication payload", async () => {
    await recordWebhookAttempt(cfg.id, attempt, cfg);
    const saved = storage.saved?.last_attempt as typeof attempt;
    expect(saved.body).toEqual({ order_status: "paid", Customer: { email: "person@example.test" }, Product: { id: "plan-1" } });
    expect(JSON.stringify(storage.saved)).not.toContain("fake-billing-secret");
    expect(JSON.stringify(storage.saved)).not.toContain("fake-password");
    expect(JSON.stringify(storage.saved)).not.toContain("fake-token");
  });

  it("filters previously persisted raw bodies and history before an admin response", async () => {
    storage.row = { id: cfg.id, label: cfg.label, active: true, secret_value: cfg.secretValue, secret_body_field: cfg.secretBodyField,
      email_path: cfg.emailPath, status_path: cfg.statusPath, plan_path: cfg.planPath, activate_values: ["paid"], deactivate_values: [], created_at: cfg.createdAt,
      last_attempt: { ...attempt, history: [{ at: attempt.at, event: "paid", email: "person@example.test", authOk: true, outcome: `ignored ${cfg.secretValue}`, unexpected: "fake-password" }] } };
    const read = await getBillingWebhookById(cfg.id);
    expect(read?.secretValue).toBe(cfg.secretValue); // server-side authentication is preserved
    const safe = billingWebhookAdminView(read!);
    expect(safe.secretValue).toBe("••••••••");
    expect(safe.lastAttempt?.body).toEqual({ order_status: "paid", Customer: { email: "person@example.test" }, Product: { id: "plan-1" } });
    expect(JSON.stringify(safe)).not.toContain("fake-billing-secret");
    expect(JSON.stringify(safe)).not.toContain("fake-password");
  });

  it("does not copy an authentication field even when a mapping overlaps it", async () => {
    await recordWebhookAttempt(cfg.id, attempt, { ...cfg, statusPath: "credentials.magic", planPath: "token" });
    expect(JSON.stringify(storage.saved)).not.toContain("fake-billing-secret");
    expect(JSON.stringify(storage.saved)).not.toContain("fake-token");
  });

  it("does not expose tokens disguised in mapped values, result details or legacy history", () => {
    const safe = billingWebhookAdminView({ ...cfg, lastAttempt: { ...attempt,
      body: { order_status: `paid ${cfg.secretValue}`, Customer: { email: "person@example.test" } },
      result: { ok: false, error: `failure ${cfg.secretValue}` },
      history: [{ at: attempt.at, authOk: false, outcome: `failure ${cfg.secretValue}` }],
    } });
    expect(JSON.stringify(safe)).not.toContain("fake-billing-secret");
  });

  it("redacts a historical body credential reflected in mapped fields, results and history after rotation", () => {
    const retired = "fake-retired-token";
    const safe = billingWebhookAdminView({ ...cfg, lastAttempt: { ...attempt,
      body: { order_status: `paid ${retired}`, Customer: { email: "person@example.test" }, credentials: { magic: retired }, token: retired },
      result: { ok: false, error: `failure ${retired}` },
      history: [{ at: attempt.at, authOk: false, outcome: `failure ${retired}` }],
    } });
    expect(JSON.stringify(safe)).not.toContain(retired);
  });
});
