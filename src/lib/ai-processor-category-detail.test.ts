import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const generateContent = vi.hoisted(() => vi.fn());
vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel() { return { generateContent }; }
  },
}));
vi.mock("./whatsapp-config", () => ({
  getConfig: vi.fn(async () => ({ geminiApiKey: "fake-category-classifier-key" })),
}));

import { processMessage, type AIResult, type AiContext } from "./ai-processor";

const period = { from: "2026-09-01", to: "2026-09-30" };
const context: AiContext = {
  phone: "5544999000000",
  user: {
    id: "category-detail-fixture",
    activeMode: "personal",
    customCategoriesExpense: ["Cuidados dos pets"],
    customCategoriesIncome: [],
    locale: "pt-BR",
  },
  history: [
    { role: "user", content: "qual categoria eu gastei mais em setembro de 2026?" },
    { role: "assistant", content: "De 01/09/2026 a 30/09/2026, Outros foi sua maior categoria de despesas." },
  ],
};

function modelReturns(result: Partial<AIResult>) {
  generateContent.mockResolvedValueOnce({
    response: { text: () => JSON.stringify({ confidence: 0.96, ...result }) },
  });
}

describe("category transaction details through the real AI result normalizer", () => {
  beforeEach(() => {
    vi.stubEnv("AI_FIRST_INTENT_ENABLED", "true");
    vi.stubEnv("OPENAI_TEST_USER_IDS", "");
    vi.stubEnv("OPENAI_API_KEY", "");
    generateContent.mockReset();
  });
  afterEach(() => { vi.unstubAllEnvs(); });

  it.each([
    ["me descreve o que tem em outros?", "Outros"],
    ["lista os lançamentos da categoria Outros", "Outros"],
    ["detalha meus gastos em Alimentação", "Alimentação"],
    ["me descreve o que tem em Cuidados dos pets", "Cuidados dos pets"],
  ])("reads the user's category records instead of generic help: %s", async (message, category) => {
    // Reproduce the provider's observed error while preserving its resolved
    // conversation period. Only the external classifier is mocked.
    modelReturns({ intent: "how_to", period, response: "Essa categoria reúne despesas diversas." });
    const result = await processMessage(message, context);
    expect(result).toMatchObject({ intent: "finance_detail", category, period });
    expect(result.keyword).toBeUndefined();
    expect(result.response).toBeUndefined();
  });

  it("keeps category and period when the provider already chooses finance_detail", async () => {
    modelReturns({ intent: "finance_detail", category: "Alimentação", period });
    const result = await processMessage("detalha meus gastos em Alimentação", context);
    expect(result).toMatchObject({ intent: "finance_detail", category: "Alimentação", period });
    expect(result.keyword).toBeUndefined();
  });

  it("keeps an explicit educational question educational even after category analysis", async () => {
    const response = "Outros agrupa despesas que não se encaixam nas demais categorias.";
    modelReturns({ intent: "how_to", response });
    expect(await processMessage("o que é a categoria Outros?", context))
      .toMatchObject({ intent: "how_to", response });
  });

  it.each([
    ["altere a categoria do meu último lançamento de Outros para Alimentação", "finance_edit"],
    ["exclua o lançamento de 20 reais na categoria Outros", "finance_delete"],
  ] as const)("does not replace a requested mutation with a category read: %s", async (message, intent) => {
    modelReturns({ intent, category: "Outros" });
    expect((await processMessage(message, context)).intent).toBe(intent);
  });
});

it("selects receipt records for a category used only for income",async()=>{
 modelReturns({intent:"how_to",period,response:"Categoria de salário"});
 expect(await processMessage("lista os lançamentos da categoria Salário",context)).toMatchObject({intent:"finance_detail",category:"Salário",financeType:"income",period});
});

it.each([["lista os lançamentos da categoria Outros da empresa","business"],["me descreve o que tem em Outros pessoal","personal"]])("preserves an explicit workspace when recovering a generic model reply: %s",async(message,mode)=>{
 modelReturns({intent:"how_to",period,response:"Categoria genérica"});
 expect(await processMessage(message,{...context,user:{...context.user,activeMode:mode==="business"?"personal":"business"}})).toMatchObject({intent:"finance_detail",category:"Outros",mode,period});
});
