import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const boundary = vi.hoisted(() => ({generateContent: vi.fn(), fetch: vi.fn()}));
vi.mock("server-only", () => ({}));
vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel() { return {generateContent: boundary.generateContent}; }
  },
}));
vi.mock("./whatsapp-config", () => ({
  getConfig: vi.fn(async () => ({geminiApiKey: "fictional-merchant-policy-classifier"})),
}));

import { descriptionExpenseCategory, normalizeExpenseCategories } from "./expense-category";
import { bankCategory } from "./bank-category";
import { processMessage, type AIResult, type AiContext } from "./ai-processor";
import type { BankMovement } from "./open-finance-report";

const foodMerchants = [
  "Silvio Lanches", "Sílvio Lanches", "SILVIO*LANCHES", "Lanches", "Lanches da esquina",
  "Ebi", "EBI RESTAURANTE JAPONÊS", "Compra no Ebi",
  "Maday Pizza Bar", "MADAY*PIZZA*BAR", "Pizza", "Pizza comprada no balcão", "Pizzaria da Praça",
  "Burger King", "BURGER*KING", "BurgerKing", "BK", "BK*FICTICIO", "BK Brasil",
  "McDonald's", "McDonalds", "MCDONALD'S", "MC DONALDS", "MC*DONALDS", "Mc Donald's",
  "Subway", "Bob's", "Bobs", "Habib's", "Habibs", "KFC", "Pizza Hut", "PIZZA*HUT",
  "Domino's", "Dominos", "DOMINO*S",
];

const context: AiContext = {
  phone: "5511000000000",
  user: {
    id: "fictional-merchant-policy-user", activeMode: "business", locale: "pt-BR",
    customCategoriesExpense: ["Evento empresa"], customCategoriesIncome: [],
  },
  history: [],
};

function financeResult(description: string, category = "Outros"): AIResult {
  return {
    intent: "finance_register", confidence: 0.95, mode: "business",
    finance: {
      type: "expense", amount: 52, description, category, date: "2026-10-13", mode: "business",
      accountHint: "Conta fictícia", employeeName: "Pessoa fictícia",
    },
  };
}

function movement(description: string, patch: Partial<BankMovement> = {}): BankMovement {
  return {
    id: "fictional-merchant-policy-movement", resource_id: "fictional-resource", resource_name: "Conta fictícia",
    institution_name: "Banco fictício", resource_type: "account", date: "2026-10-13", description,
    amount: "52.00", currency: "BRL", direction: "debit", classification: "purchase", kind: "account_debits",
    source_category: "FOOD_AND_DRINK_RESTAURANT", bill_month: null, installment_number: null, installment_count: null,
    ...patch,
  };
}

beforeEach(() => {
  vi.stubEnv("AI_FIRST_INTENT_ENABLED", "true");
  vi.stubEnv("AI_FIRST_INTENT_TEST_PHONES", "");
  vi.stubEnv("OPENAI_TEST_USER_IDS", "");
  vi.stubEnv("OPENAI_API_KEY", "");
  vi.stubEnv("GEMINI_API_KEY", "");
  boundary.generateContent.mockReset();
  boundary.fetch.mockReset();
  boundary.fetch.mockImplementation(() => { throw new Error("REAL_TRANSPORT_FORBIDDEN"); });
  vi.stubGlobal("fetch", boundary.fetch);
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("food merchant policy uses Delivery without requiring delivery evidence", () => {
  it.each(foodMerchants)("recognizes the food merchant or purpose %s", description => {
    expect(descriptionExpenseCategory(description)).toBe("Delivery");
    expect(bankCategory(movement(description))).toEqual({name: "Delivery", source: "description"});
  });

  it.each(["Silvio Lanches", "Ebi", "Maday Pizza Bar", "Burger King", "McDonald's"])(
    "normalizes a new %s expense and preserves amount, mode and existing extension fields", description => {
      const modelAnswer = financeResult(description);
      const financeWithSource = {...modelAnswer.finance!, source: "whatsapp" as const};
      const original: AIResult = {...modelAnswer, finance: financeWithSource};
      const before = structuredClone(original);

      expect(normalizeExpenseCategories(`Paguei 52 no ${description}`, original)).toEqual({
        ...original, finance: {...financeWithSource, category: "Delivery"},
      });
      expect(original).toEqual(before);
    },
  );

  it.each([
    {resource_type: "account", direction: "debit", kind: "account_debits"},
    {resource_type: "card", direction: "debit", kind: "card_purchases"},
    {resource_type: "card", direction: "credit", kind: "credits"},
  ] as const)("corrects provider Alimentação for $resource_type/$direction without mutating the movement", sample => {
    const original = movement("Silvio Lanches", sample);
    const before = structuredClone(original);
    expect(bankCategory(original)).toEqual({name: "Delivery", source: "description"});
    expect(original).toEqual(before);
  });

  it.each(["Alimentação", "Evento empresa"])("preserves the person's explicit %s category across bank and new expense paths", category => {
    const original = financeResult("Silvio Lanches", category);
    expect(normalizeExpenseCategories(`Paguei 52 no Silvio Lanches na categoria ${category}`, original)).toEqual(original);
    expect(bankCategory(movement("Silvio Lanches", {user_category: category}))).toEqual({name: category, source: "user"});
  });

  it.each(["IOF Burger King", "IOF McDonald's", "Juros do cartão Silvio Lanches", "Tarifa bancária Ebi"])(
    "keeps banking charges ahead of the food merchant in %s", description => {
      expect(descriptionExpenseCategory(description)).toBe("Encargos bancários");
      expect(bankCategory(movement(description))).toEqual({name: "Encargos bancários", source: "description"});
      expect(normalizeExpenseCategories(`Paguei 52 de ${description}`, financeResult(description)).finance?.category).toBe("Encargos bancários");
    },
  );
});

describe("food merchant policy does not broadly label other purchases as Delivery", () => {
  it.each(["Jogo de dominó", "Dominó de madeira", "Pix enviado - Jerônimo Silva"])(
    "does not turn an unrelated object or personal name into a food chain: %s", description => {
      expect(descriptionExpenseCategory(description)).not.toBe("Delivery");
      expect(bankCategory(movement(description, {source_category: null})).name).not.toBe("Delivery");
    },
  );
  it.each(["Pizza congelada do supermercado", "Lanche comprado no supermercado", "Padaria - lanche"])(
    "keeps explicit grocery and bakery purchases in Alimentação: %s", description => {
      expect(descriptionExpenseCategory(description)).toBe("Alimentação");
    },
  );
  it.each(["Delivery de livros", "Delivery de eletrônicos", "Entrega de documentos"])(
    "rejects food enrichment contradicted by non-food goods: %s", description => {
      expect(bankCategory(movement(description, {source_category: "FOOD_AND_DRINK_FAST_FOOD"})).name).not.toBe("Delivery");
    },
  );
  it.each(["Alimentos do supermercado", "Arroz e feijão no mercado", "Supermercado Exemplo", "Compras no Carrefour"])(
    "keeps supermarket food in Alimentação: %s", description => {
      expect(descriptionExpenseCategory(description)).toBe("Alimentação");
      expect(bankCategory(movement(description, {source_category: "FOOD_AND_DRINK_GROCERIES"})).name).toBe("Alimentação");
      expect(normalizeExpenseCategories(`Paguei 52 por ${description}`, financeResult(description)).finance?.category).toBe("Alimentação");
    },
  );

  it.each([
    "Delivery de farmácia", "Delivery de medicamentos", "Delivery de livros", "Delivery de roupas",
    "Delivery de cosméticos", "Livro sobre pizza", "Roupas com estampa de pizza",
  ])("keeps explicit non-food goods outside Delivery: %s", description => {
    expect(descriptionExpenseCategory(description)).not.toBe("Delivery");
    expect(bankCategory(movement(description, {source_category: "GENERAL_MERCHANDISE_OTHER"})).name).not.toBe("Delivery");
    expect(normalizeExpenseCategories(`Paguei 52 por ${description}`, financeResult(description, "Delivery")).finance?.category).not.toBe("Delivery");
  });

  it.each([
    "O Boticário", "Franquia O Boticário", "Franquia Cacau fictícia de software", "Franquia Renner",
    "Exibição cultural", "Exibicao de filme", "Crédito recebido", "Acessórios Zebito",
  ])("does not infer a food franchise or isolated Ebi from %s", description => {
    expect(descriptionExpenseCategory(description)).not.toBe("Delivery");
    expect(bankCategory(movement(description, {source_category: "GENERAL_MERCHANDISE_OTHER"})).name).not.toBe("Delivery");
    expect(normalizeExpenseCategories(`Paguei 52 por ${description}`, financeResult(description)).finance?.category).not.toBe("Delivery");
  });
});

describe("the real Gemini result path applies the food merchant policy", () => {
  it("calls the fictitious classifier before resolving Silvio Lanches to Delivery and preserves the FinanceData contract", async () => {
    const original = financeResult("Silvio Lanches");
    type GeminiReply = {response: {text: () => string}};
    let reply: (value: GeminiReply) => void = () => {};
    boundary.generateContent.mockReturnValueOnce(new Promise<GeminiReply>(resolve => { reply = resolve; }));
    let settled = false;
    const message = "Gastei R$ 52 no Silvio Lanches";
    const pending = processMessage(message, context).finally(() => { settled = true; });

    await vi.waitFor(() => expect(boundary.generateContent).toHaveBeenCalledOnce());
    expect(boundary.generateContent).toHaveBeenCalledWith(expect.stringContaining(message));
    expect(settled).toBe(false);
    reply({response: {text: () => JSON.stringify(original)}});
    const result = await pending;

    expect(boundary.generateContent).toHaveBeenCalledOnce();
    expect(boundary.fetch).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      intent: "finance_register", mode: "business",
      finance: {type: "expense", amount: 52, description: "Silvio Lanches", date: "2026-10-13", mode: "business"},
    });
    expect(result.finance?.category).toBe("Delivery");
    expect(original.finance?.category).toBe("Outros");
  });

  it.each(["Alimentação", "Evento empresa"])("preserves an explicit %s choice after the classifier is called", async category => {
    const original = financeResult("Silvio Lanches", category);
    boundary.generateContent.mockResolvedValueOnce({response: {text: () => JSON.stringify(original)}});
    const result = await processMessage(`Gastei R$ 52 no Silvio Lanches na categoria ${category}`, context);

    expect(boundary.generateContent).toHaveBeenCalledOnce();
    expect(boundary.fetch).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      intent: "finance_register", finance: {type: "expense", amount: 52, description: "Silvio Lanches", category, date: "2026-10-13", mode: "business"},
    });
  });

  it("keeps IOF as bank charges after a fictitious model suggests a food merchant expense", async () => {
    const original = financeResult("IOF Burger King");
    boundary.generateContent.mockResolvedValueOnce({response: {text: () => JSON.stringify(original)}});
    const result = await processMessage("Paguei R$ 52 de IOF Burger King", context);

    expect(boundary.generateContent).toHaveBeenCalledOnce();
    expect(boundary.fetch).not.toHaveBeenCalled();
    expect(result.finance).toMatchObject({amount: 52, category: "Encargos bancários", description: "IOF Burger King", mode: "business"});
  });

  it("keeps a non-food franchise outside Delivery after the classifier is called", async () => {
    const original = financeResult("Franquia O Boticário");
    boundary.generateContent.mockResolvedValueOnce({response: {text: () => JSON.stringify(original)}});
    const result = await processMessage("Paguei R$ 52 na franquia O Boticário", context);

    expect(boundary.generateContent).toHaveBeenCalledOnce();
    expect(boundary.fetch).not.toHaveBeenCalled();
    expect(result.finance).toMatchObject({amount: 52, description: "Franquia O Boticário", mode: "business"});
    expect(result.finance?.category).not.toBe("Delivery");
  });
});
