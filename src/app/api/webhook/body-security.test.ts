import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ handle: vi.fn(), begin: vi.fn(), dedup: vi.fn(), signature: vi.fn(), cfg: vi.fn(), billing: vi.fn(), record: vi.fn(), evaluate: vi.fn() }));
vi.mock("@/lib/message-handler", () => ({ handleIncomingMessage: mocks.handle }));
vi.mock("@/lib/whatsapp-activity", () => ({ beginWhatsAppActivity: mocks.begin }));
vi.mock("@/lib/webhook-dedup", () => ({ alreadyProcessed: mocks.dedup }));
vi.mock("@/lib/waba", () => ({ verifySignature: mocks.signature, verifyToken: vi.fn(), downloadMedia: vi.fn() }));
vi.mock("@/lib/whatsapp", () => ({ sendText: vi.fn() }));
vi.mock("@/lib/evolution", () => ({ getBase64FromMediaMessage: vi.fn() }));
vi.mock("@/lib/ai-processor", () => ({ transcribeAudio: vi.fn() }));
vi.mock("@/lib/whatsapp-config", () => ({ getConfig: mocks.cfg }));
vi.mock("@/lib/wpp-phone-links", () => ({ getUserIdByPhone: vi.fn() }));
vi.mock("@/lib/billing-webhooks", () => ({ getBillingWebhookById: mocks.billing, verifyBillingWebhookAuth: vi.fn(() => true), recordWebhookAttempt: mocks.record, evaluateBillingWebhook: mocks.evaluate }));
import { POST as waba } from "./waba/route";
import { POST as evolution } from "./evolution/route";
import { POST as billing } from "./billing/[id]/route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.cfg.mockResolvedValue({ waba: { appSecret: "fake-secret" }, evolution: { webhookSecret: "fake-secret" } });
  mocks.signature.mockResolvedValue(true);
  mocks.billing.mockResolvedValue({ id: "fake-billing", active: true });
  mocks.evaluate.mockResolvedValue({ ok: true, action: "ignored" });
});

function streamedRequest(path: string, length: number, declared?: number, signature = `sha256=${"0".repeat(64)}`) {
  let remaining = length;
  const cancel = vi.fn();
  const body = new ReadableStream<Uint8Array>({
    pull(controller) { const size = Math.min(65_536, remaining); if (!size) { controller.close(); return; } remaining -= size; controller.enqueue(new Uint8Array(size).fill(32)); }, cancel,
  });
  const init = {
    method: "POST", body, duplex: "half" as const, headers: { "content-type": "application/json", "x-hub-signature-256": signature, ...(declared === undefined ? {} : { "content-length": String(declared) }) },
  };
  return { cancel, req: new NextRequest(`https://zelo.example.test/api/webhook/${path}`, init) };
}

describe("bounded webhook intake", () => {
  it.each([undefined, 1])("caps actual WABA bytes without trusting Content-Length %s before any activity", async declared => {
    const { req, cancel } = streamedRequest("waba", 2 * 1_048_576, declared);
    expect((await waba(req)).status).toBe(413);
    expect(cancel).toHaveBeenCalled();
    expect(mocks.signature).not.toHaveBeenCalled(); expect(mocks.begin).not.toHaveBeenCalled(); expect(mocks.dedup).not.toHaveBeenCalled(); expect(mocks.handle).not.toHaveBeenCalled();
  });
  it("rejects an invalid WABA signature shape before reading an attacker body", async () => {
    const { req } = streamedRequest("waba", 10, undefined, "sha256=bad");
    expect((await waba(req)).status).toBe(403);
    expect(req.bodyUsed).toBe(false);
    expect(mocks.signature).not.toHaveBeenCalled();
  });
  it("rejects oversized billing input before diagnostic writes or client changes", async () => {
    const { req, cancel } = streamedRequest("billing/fake-billing", 2 * 1_048_576, 1);
    expect((await billing(req, { params: Promise.resolve({ id: "fake-billing" }) })).status).toBe(413);
    expect(cancel).toHaveBeenCalled(); expect(mocks.record).not.toHaveBeenCalled(); expect(mocks.evaluate).not.toHaveBeenCalled();
  });
  it("allows bounded Evolution inline media and caps actual streamed bytes above 20 MiB", async () => {
    const { req, cancel } = streamedRequest("evolution?secret=fake-secret", 21 * 1_048_576, 1);
    expect((await evolution(req)).status).toBe(413);
    expect(cancel).toHaveBeenCalled(); expect(mocks.handle).not.toHaveBeenCalled();
  });
  it("keeps authenticated small webhook acknowledgements and dry billing processing", async () => {
    const req = (path: string, body: string) => new NextRequest(`https://zelo.example.test/api/webhook/${path}`, { method: "POST", body, headers: { "content-type": "application/json", "x-hub-signature-256": `sha256=${"0".repeat(64)}` } });
    expect((await waba(req("waba", "{}"))).status).toBe(200);
    expect((await evolution(req("evolution?secret=fake-secret", "{}"))).status).toBe(200);
    expect((await billing(req("billing/fake-billing", '{"event":"paid"}'), { params: Promise.resolve({ id: "fake-billing" }) })).status).toBe(200);
    expect(mocks.evaluate).toHaveBeenCalledOnce(); expect(mocks.record).toHaveBeenCalledOnce();
  });
});
