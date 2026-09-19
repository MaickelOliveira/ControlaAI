import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const googleGenerateContent = vi.hoisted(() => vi.fn());

vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel() {
      return { generateContent: googleGenerateContent };
    }
  },
}));

vi.mock("./whatsapp-config", () => ({
  getConfig: vi.fn(async () => ({ geminiApiKey: "gemini-test-key" })),
}));

import { processMessage } from "./ai-processor";

const originalFetch = globalThis.fetch;
const originalApiKey = process.env.OPENAI_API_KEY;
const originalTestUserIds = process.env.OPENAI_TEST_USER_IDS;

const context = {
  user: {
    id: "test-user",
    activeMode: "personal" as const,
    customCategoriesExpense: [],
    customCategoriesIncome: [],
    locale: "pt-BR" as const,
  },
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("AI provider routing", () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = "openai-test-key";
    process.env.OPENAI_TEST_USER_IDS = "test-user";
    googleGenerateContent.mockReset();
    googleGenerateContent.mockResolvedValue({
      response: {
        text: () => '{"intent":"unknown","confidence":0.4}',
        candidates: [],
      },
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
    if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalApiKey;
    if (originalTestUserIds === undefined) delete process.env.OPENAI_TEST_USER_IDS;
    else process.env.OPENAI_TEST_USER_IDS = originalTestUserIds;
  });

  it("uses OpenAI only for an allowlisted user", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      output: [{ type: "message", content: [{ type: "output_text", text: '{"intent":"help","confidence":0.95}' }] }],
    }));
    globalThis.fetch = fetchMock as typeof fetch;

    await expect(processMessage("mensagem experimental incompreensível", context))
      .resolves.toMatchObject({ intent: "help", confidence: 0.95 });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(googleGenerateContent).not.toHaveBeenCalled();
  });

  it("falls back to Gemini when OpenAI fails", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ error: { message: "falha simulada" } }, 401));
    globalThis.fetch = fetchMock as typeof fetch;

    await expect(processMessage("mensagem experimental incompreensível", context))
      .resolves.toMatchObject({ intent: "unknown", confidence: 0.4 });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(googleGenerateContent).toHaveBeenCalledOnce();
  });

  it("keeps non-allowlisted users on Gemini", async () => {
    process.env.OPENAI_TEST_USER_IDS = "another-user";
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as typeof fetch;

    await expect(processMessage("mensagem experimental incompreensível", context))
      .resolves.toMatchObject({ intent: "unknown", confidence: 0.4 });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(googleGenerateContent).toHaveBeenCalledOnce();
  });
});
