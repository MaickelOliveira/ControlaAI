import { afterEach, expect, it, vi } from "vitest";

const modelOptions = vi.hoisted(() => vi.fn());
vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel(options: unknown) {
      modelOptions(options);
      return { generateContent: async () => ({ response: { text: () => JSON.stringify({ intent: "help", confidence: 1 }) } }) };
    }
  },
}));
vi.mock("./whatsapp-config", () => ({ getConfig: vi.fn(async () => ({ geminiApiKey: "fake-key" })) }));

import { DEFAULT_GEMINI_MODEL, geminiModel } from "./gemini-model";
import { processMessage } from "./ai-processor";

afterEach(() => { vi.unstubAllEnvs(); modelOptions.mockReset(); });

it("usa o Gemini 3.8 Flash por padrão, nunca o 2.5 descontinuado", () => {
  vi.stubEnv("ZELO_GEMINI_MODEL", "");
  expect(DEFAULT_GEMINI_MODEL).toBe("gemini-3.8-flash");
  expect(geminiModel()).toBe("gemini-3.8-flash");
});

it("permite trocar o modelo de todo o sistema pela variável de ambiente", () => {
  vi.stubEnv("ZELO_GEMINI_MODEL", " gemini-3.5-flash-lite ");
  expect(geminiModel()).toBe("gemini-3.5-flash-lite");
});

it("o classificador do WhatsApp chama o modelo configurado", async () => {
  vi.stubEnv("ZELO_GEMINI_MODEL", "");
  vi.stubEnv("OPENAI_TEST_USER_IDS", "");
  vi.stubEnv("AI_FIRST_INTENT_ENABLED", "all");
  await processMessage("me ajuda com uma coisa diferente", {
    phone: "5511999990000",
    user: { id: "u1", activeMode: "personal", customCategoriesExpense: [], customCategoriesIncome: [], locale: "pt-BR" },
  });
  expect(modelOptions).toHaveBeenCalledWith(expect.objectContaining({ model: "gemini-3.8-flash" }));
  expect(modelOptions).not.toHaveBeenCalledWith(expect.objectContaining({ model: "gemini-2.5-flash" }));
});
