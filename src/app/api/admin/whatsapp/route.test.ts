import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ session: vi.fn(), getConfig: vi.fn(), saveConfig: vi.fn(), checkConnection: vi.fn(), attention: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getAdminSession: mocks.session }));
vi.mock("@/lib/whatsapp-config", () => ({ getConfig: mocks.getConfig, saveConfig: mocks.saveConfig }));
vi.mock("@/lib/whatsapp", () => ({ checkConnection: mocks.checkConnection }));
vi.mock("@/lib/evolution", () => ({ createOrRestartInstance: vi.fn() }));
vi.mock("@/lib/waba", () => ({ sendTemplate: vi.fn() }));
vi.mock("@/lib/bot-info", () => ({ detectBotNumber: vi.fn() }));
vi.mock("@/lib/conversations", () => ({ addMessage: vi.fn() }));
vi.mock("@/lib/waba-inbox", () => ({ wabaInboxAttentionCount: mocks.attention }));

import { GET, PUT } from "./route";

const config = { provider: "waba", waba: { verifyToken: "fixture-private-verify-token", accessToken: "fixture-private-access-token", appSecret: "fixture-private-app-secret" } };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ role: "admin" });
  mocks.getConfig.mockResolvedValue(config);
  mocks.checkConnection.mockResolvedValue("CONNECTED");
  mocks.attention.mockResolvedValue(0);
});

it("shows admins only the number of messages needing review, never their content", async () => {
  mocks.attention.mockResolvedValueOnce(2);
  const body = await (await GET()).json();
  expect(body.inboxAttentionCount).toBe(2);
  expect(JSON.stringify(body)).not.toContain("payload");
});

it("does not inspect the inbox for an unauthenticated browser", async () => {
  mocks.session.mockResolvedValueOnce(null);
  expect((await GET()).status).toBe(401);
  expect(mocks.attention).not.toHaveBeenCalled();
});

it("never sends the WhatsApp verification secret to the administration browser", async () => {
  const response = await GET();
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.waba.verifyToken).toBe("••••••••");
  expect(JSON.stringify(body)).not.toContain(config.waba.verifyToken);
});

it("keeps the saved verification secret when the masked form is saved unchanged", async () => {
  const request = new NextRequest("https://zelo.example/api/admin/whatsapp", {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider: "waba", waba: { verifyToken: "••••••••" } }),
  });
  expect((await PUT(request)).status).toBe(200);
  expect(mocks.saveConfig).toHaveBeenCalledWith(expect.objectContaining({
    waba: expect.objectContaining({ verifyToken: config.waba.verifyToken }),
  }));
});

it("reports only the effective AI routing mode and provider readiness to the admin", async () => {
  vi.stubEnv("AI_FIRST_INTENT_ENABLED", "canary");
  vi.stubEnv("GEMINI_API_KEY", "fixture-private-gemini-key");
  try {
    const body = await (await GET()).json();
    expect(body.aiIntentMode).toBe("canary");
    expect(body.aiProviderReady).toBe(true);
    expect(JSON.stringify(body)).not.toContain("fixture-private-gemini-key");
  } finally {
    vi.unstubAllEnvs();
  }
});
