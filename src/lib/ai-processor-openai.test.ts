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

import { extractInvoiceTransactions, financialDocumentDescription, normalizeFinancialDocumentExtraction, normalizeFinancialTransactionListExtraction, processMessage } from "./ai-processor";

const originalFetch = globalThis.fetch;
const originalApiKey = process.env.OPENAI_API_KEY;
const originalTestUserIds = process.env.OPENAI_TEST_USER_IDS;
const originalAiFirst = process.env.AI_FIRST_INTENT_ENABLED;
const originalTestPhones = process.env.AI_FIRST_INTENT_TEST_PHONES;

const context = {
  phone: "5544999887766",
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
    process.env.AI_FIRST_INTENT_ENABLED = "canary";
    process.env.AI_FIRST_INTENT_TEST_PHONES = context.phone;
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
    if (originalAiFirst === undefined) delete process.env.AI_FIRST_INTENT_ENABLED;
    else process.env.AI_FIRST_INTENT_ENABLED = originalAiFirst;
    if (originalTestPhones === undefined) delete process.env.AI_FIRST_INTENT_TEST_PHONES;
    else process.env.AI_FIRST_INTENT_TEST_PHONES = originalTestPhones;
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

  it.each([
    ["Quanto ainda posso comprar usando meu Nubank?", "limits"],
    ["Qual o total que devo de crédito contratado?", "loans"],
    ["Me explica meus parcelamentos no cartão", "installments"],
    ["Como estão minhas aplicações?", "investments"],
    ["O que entrou na minha conta ontem?", "income"],
  ])("preserves a model-interpreted banking capability for natural wording: %s", async (message, kind) => {
    process.env.OPENAI_TEST_USER_IDS = "another-user";
    googleGenerateContent.mockResolvedValueOnce({ response: { text: () => JSON.stringify({ intent: "bank_query", confidence: .95, bankQuery: { kind, bankName: "Nubank", userId: "other", total: 9999 } }) } });
    const answer = await processMessage(message, context);
    expect(answer).toMatchObject({ intent: "bank_query", bankQuery: { kind, bankName: "Nubank" } });
    expect(answer.bankQuery).not.toHaveProperty("userId"); expect(answer.bankQuery).not.toHaveProperty("total");
  });

  it.each([
    ["Mostre tarifas bancárias cobradas neste mês.", "finance_query", { kind: "transactions", operation: "list", direction: "debit", movementClass: "bank_fee" }],
    ["Qual foi o maior débito bancário do mês?", "finance_analysis", { kind: "transactions", operation: "max", direction: "debit", source: "account" }],
    ["Qual foi o maior crédito bancário do mês?", "how_to", { kind: "transactions", operation: "max", direction: "credit", source: "account" }],
    ["Quais faturas vencem amanhã?", "finance_upcoming", { kind: "bill_due" }],
    ["Quais faturas vencem nos próximos três dias?", "finance_upcoming", { kind: "bill_due" }],
    ["Quais faturas vencem nos próximos quinze dias?", "finance_upcoming", { kind: "bill_due" }],
    ["Quais faturas vencem até o fim deste mês?", "finance_upcoming", { kind: "bill_due" }],
  ] as const)("repairs a broad AI classification into a read-only bank plan: %s", async (message, broadIntent, plan) => {
    process.env.OPENAI_TEST_USER_IDS = "another-user";
    googleGenerateContent.mockResolvedValueOnce({ response: { text: () => JSON.stringify({ intent: broadIntent, confidence: .95 }) } });
    const answer = await processMessage(message, context);
    expect(answer).toMatchObject({ intent: "bank_query", bankQuery: plan });
    if (message.startsWith("Mostre tarifas")) expect(answer.bankQuery?.source).toBeUndefined();
    if (message.includes("amanhã")) expect(answer.period?.from).toBe(answer.period?.to);
    if (message.includes("três dias")) expect(answer.period).toBeDefined();
  });
  it("keeps the bank explicitly named by the customer while refining a largest-debit plan", async () => {
    process.env.OPENAI_TEST_USER_IDS = "another-user";
    googleGenerateContent.mockResolvedValueOnce({ response: { text: () => JSON.stringify({ intent: "bank_query", confidence: .95, bankQuery: { kind: "transactions", bankName: "Nubank", operation: "max", direction: "debit", source: "account" } }) } });
    expect(await processMessage("Qual foi o maior débito bancário no Nubank?", context))
      .toMatchObject({ intent: "bank_query", bankQuery: { kind: "transactions", operation: "max", direction: "debit", source: "account", bankName: "Nubank" } });
  });

  it.each([
    ["Qual foi meu resultado financeiro no mês passado?", "result"],
    ["Compare o gasto desta semana com a semana anterior.", "spending"],
    ["Compare as entradas deste mês com as do mês passado.", "income"],
    ["Quais foram as cinco maiores despesas deste mês?", "spending"],
    ["Quais foram as cinco maiores receitas deste mês?", "income"],
  ])("keeps a general finance request in the unified ledger despite a bank-only model guess: %s", async(message,kind)=>{
    process.env.OPENAI_TEST_USER_IDS="another-user";
    googleGenerateContent.mockResolvedValueOnce({response:{text:()=>JSON.stringify({intent:"bank_query",confidence:.95,bankQuery:{kind}})}});
    const answer=await processMessage(message,context);
    expect(answer.intent).toBe("finance_query");
    expect(answer.bankQuery).toBeUndefined();
  });
  it("keeps a named bank result as a bank-only query",async()=>{
    process.env.OPENAI_TEST_USER_IDS="another-user";
    googleGenerateContent.mockResolvedValueOnce({response:{text:()=>JSON.stringify({intent:"bank_query",confidence:.95,bankQuery:{kind:"result",bankName:"Nubank"}})}});
    const answer=await processMessage("Qual foi meu resultado financeiro no Nubank mês passado?",context);
    expect(answer).toMatchObject({intent:"bank_query",bankQuery:{kind:"result",bankName:"Nubank"}});
  });

  it("keeps an explicitly requested merchant when the model drops it and returns a broad expense category", async () => {
    process.env.OPENAI_TEST_USER_IDS = "another-user";
    googleGenerateContent.mockResolvedValueOnce({ response: { text: () => JSON.stringify({ intent: "finance_query", confidence: .95, category: "Alimentação" }) } });
    const answer = await processMessage("quanto gastei com ze delivery esse mes", context);
    expect(answer.keyword).toBe("ze delivery"); expect(answer.category).toBeUndefined();
  });
  it("routes merchant totals through all financial origins even if the model chooses supermarket history",async()=>{
    process.env.OPENAI_TEST_USER_IDS="another-user";
    googleGenerateContent.mockResolvedValueOnce({response:{text:()=>JSON.stringify({intent:"grocery_spend_query",confidence:.96,grocery:{storeName:"Amazonas",period:{from:"2026-09-01",to:"2026-09-30"}}})}});
    const answer=await processMessage("quanto gastei no amazonas mes passado",context);
    expect(answer.intent).toBe("finance_query"); expect(answer.keyword).toBe("amazonas"); expect(answer.period).toBeDefined();
  });
  it.each([["Zé Delivery","Outros","Delivery"],["Google*ADS","Moradia","Marketing"],["Facebook Serviços Online","Lazer","Marketing"],["Google Workspace","Moradia","Tecnologia"]])("corrects the model's automatic category for %s before storage",async(description,wrong,correct)=>{
    process.env.OPENAI_TEST_USER_IDS="another-user";
    googleGenerateContent.mockResolvedValueOnce({response:{text:()=>JSON.stringify({intent:"finance_register",confidence:.96,finance:{type:"expense",amount:50,description,category:wrong}})}});
    const answer=await processMessage(`gastei 50 no ${description}`,context);
    expect(answer.finance?.category).toBe(correct); expect(answer.finance?.amount).toBe(50);
  });
  it("uses the explicitly stated expense type before inferring its merchant category",async()=>{
    process.env.OPENAI_TEST_USER_IDS="another-user";
    googleGenerateContent.mockResolvedValueOnce({response:{text:()=>JSON.stringify({intent:"finance_register",confidence:.96,finance:{type:"income",amount:50,description:"Google Ads",category:"Moradia"}})}});
    const answer=await processMessage("gastei 50 em Google Ads",context);
    expect(answer.finance?.type).toBe("expense"); expect(answer.finance?.category).toBe("Marketing");
  });

  it("falls back to Gemini when OpenAI fails", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ error: { message: "falha simulada" } }, 401));
    globalThis.fetch = fetchMock as typeof fetch;

    await expect(processMessage("mensagem experimental incompreensível", context))
      .resolves.toMatchObject({ intent: "unknown", confidence: 0.4 });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(googleGenerateContent).toHaveBeenCalledOnce();
  });

  it("lets the model interpret a numbered account request before the rules", async () => {
    process.env.OPENAI_TEST_USER_IDS = "another-user";
    googleGenerateContent.mockResolvedValueOnce({
      response: { text: () => JSON.stringify({
        intent: "account_create", confidence: 0.94, account: { name: "Sicoob", type: "bank" },
      }) },
    });

    await expect(processMessage("1 cadastrar conta Sicoob", context))
      .resolves.toMatchObject({ intent: "account_create", account: { name: "Sicoob" } });
    expect(googleGenerateContent).toHaveBeenCalledOnce();
  });

  it("passes the model's clarification question to the conversation", async () => {
    process.env.OPENAI_TEST_USER_IDS = "another-user";
    googleGenerateContent.mockResolvedValueOnce({
      response: { text: () => '{"intent":"unknown","confidence":0.35,"response":"Qual lançamento você quer alterar?"}' },
    });

    await expect(processMessage("muda isso", context))
      .resolves.toMatchObject({ intent: "unknown", response: "Qual lançamento você quer alterar?" });
  });

  it("uses the existing parser if the model cannot classify a clear request", async () => {
    process.env.OPENAI_TEST_USER_IDS = "another-user";
    googleGenerateContent.mockResolvedValueOnce({
      response: { text: () => '{"intent":"unknown","confidence":0}' },
    });

    await expect(processMessage("1 cadastrar conta Sicoob", context))
      .resolves.toMatchObject({ intent: "account_create", account: { name: "Sicoob" } });
  });

  it("asks which record is meant by an ambiguous total deletion", async () => {
    process.env.OPENAI_TEST_USER_IDS = "another-user";
    googleGenerateContent.mockResolvedValueOnce({
      response: { text: () => '{"intent":"finance_delete","confidence":0.99,"keyword":"receita total"}' },
    });

    await expect(processMessage("apagar receita total", context))
      .resolves.toMatchObject({ intent: "how_to", response: expect.stringContaining("Você quer apagar") });
  });

  it("keeps the previous routing when no test phone is configured", async () => {
    process.env.OPENAI_TEST_USER_IDS = "another-user";
    delete process.env.AI_FIRST_INTENT_TEST_PHONES;

    await expect(processMessage("1 cadastrar conta Sicoob", context))
      .resolves.toMatchObject({ intent: "account_create", account: { name: "Sicoob" } });
    expect(googleGenerateContent).not.toHaveBeenCalled();
  });

  it("keeps another customer's phone on the previous routing", async () => {
    process.env.OPENAI_TEST_USER_IDS = "another-user";

    await expect(processMessage("1 cadastrar conta Sicoob", { ...context, phone: "5544999887700" }))
      .resolves.toMatchObject({ intent: "account_create", account: { name: "Sicoob" } });
    expect(googleGenerateContent).not.toHaveBeenCalled();
  });

  it("uses AI-first for other customers after the global rollout", async () => {
    process.env.OPENAI_TEST_USER_IDS = "another-user";
    delete process.env.AI_FIRST_INTENT_ENABLED;
    googleGenerateContent.mockResolvedValueOnce({
      response: { text: () => JSON.stringify({
        intent: "account_create", confidence: 0.94, account: { name: "Sicoob", type: "bank" },
      }) },
    });

    await expect(processMessage("1 cadastrar conta Sicoob", { ...context, phone: "5544999887700" }))
      .resolves.toMatchObject({ intent: "account_create", account: { name: "Sicoob" } });
    expect(googleGenerateContent).toHaveBeenCalledOnce();
  });

  it("can return to the previous routing without changing stored data", async () => {
    process.env.OPENAI_TEST_USER_IDS = "another-user";
    process.env.AI_FIRST_INTENT_ENABLED = "false";

    await expect(processMessage("1 cadastrar conta Sicoob", context))
      .resolves.toMatchObject({ intent: "account_create", account: { name: "Sicoob" } });
    expect(googleGenerateContent).not.toHaveBeenCalled();
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

describe("invoice extraction safety", () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = "openai-test-key";
    process.env.OPENAI_TEST_USER_IDS = "test-user";
    googleGenerateContent.mockReset();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
    if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalApiKey;
    if (originalTestUserIds === undefined) delete process.env.OPENAI_TEST_USER_IDS;
    else process.env.OPENAI_TEST_USER_IDS = originalTestUserIds;
  });

  it("retries a malformed invoice response and returns the itemized list", async () => {
    googleGenerateContent
      .mockResolvedValueOnce({ response: { text: () => '{"isInvoice":true,"transactions":[' } })
      .mockResolvedValueOnce({
        response: {
          text: () => JSON.stringify({
            isInvoice: true,
            bankName: "Sicredi",
            dueDate: "2026-10-10",
            statementTotal: 100,
            sourceTransactionCount: 1,
            ignoredTransactionCount: 0,
            ignoredTransactions: [],
            transactions: [{
              date: "2026-09-20",
              description: "Mercado",
              amount: 100,
              category: "Alimentação",
              billingStatus: "current",
              transactionKind: "purchase",
            }],
          }),
        },
      });

    await expect(extractInvoiceTransactions(
      Buffer.from("pdf"),
      "application/pdf",
      undefined,
      "invoice-user",
      "fatura.pdf",
    )).resolves.toMatchObject({
      bankName: "Sicredi",
      statementTotal: 100,
      reconciled: true,
      transactions: [expect.objectContaining({ description: "Mercado", amount: 100 })],
    });
    expect(googleGenerateContent).toHaveBeenCalledTimes(2);
  });

  it("re-reads every page when an itemized total is missing a charge", async () => {
    const base = {
      isInvoice: true,
      bankName: "Sicredi",
      dueDate: "2026-10-10",
      statementTotal: 100,
      sourceTransactionCount: 2,
      ignoredTransactionCount: 0,
      ignoredTransactions: [],
    };
    googleGenerateContent
      .mockResolvedValueOnce({
        response: {
          text: () => JSON.stringify({
            ...base,
            transactions: [{
              date: "2026-09-20", description: "Mercado", amount: 80,
              category: "Alimentação", billingStatus: "current", transactionKind: "purchase",
            }],
          }),
        },
      })
      .mockResolvedValueOnce({
        response: {
          text: () => JSON.stringify({
            ...base,
            transactions: [
              {
                date: "2026-09-20", description: "Mercado", amount: 80,
                category: "Alimentação", billingStatus: "current", transactionKind: "purchase",
              },
              {
                date: "2025-11-27", description: "ASAAS Tintim", amount: 20,
                category: "Serviços", installmentCurrent: 11, installmentTotal: 12,
                billingStatus: "current", transactionKind: "purchase",
              },
            ],
          }),
        },
      });

    const result = await extractInvoiceTransactions(
      Buffer.from("pdf"), "application/pdf", undefined, "invoice-user", "fatura.pdf",
    );

    expect(result).toMatchObject({ reconciled: true, statementTotal: 100 });
    expect(result?.transactions).toHaveLength(2);
    expect(result?.transactions.find(item => item.description === "ASAAS Tintim")).toMatchObject({
      amount: 20,
      installmentCurrent: 11,
      installmentTotal: 12,
    });
    expect(googleGenerateContent).toHaveBeenCalledTimes(2);
    const retryPrompt = googleGenerateContent.mock.calls[1]?.[0]?.[0];
    expect(retryPrompt).toContain("FALTAM");
    expect(retryPrompt).toContain("20,00");
    expect(retryPrompt).toContain("TODAS AS PÁGINAS");
    expect(retryPrompt).toContain("QUALQUER banco");
    expect(retryPrompt).toContain("não descarte uma seção inteira");
  });

  it("keeps a positive financing charge from an unfamiliar statement section", async () => {
    const base = {
      isInvoice: true,
      bankName: "Banco Exemplo",
      dueDate: "2026-10-02",
      statementTotal: 2215.51,
      sourceTransactionCount: 3,
      ignoredTransactionCount: 1,
      ignoredTransactions: [{
        date: "2026-09-02", description: "Pagamento recebido", amount: 704.46, transactionKind: "payment",
      }],
    };
    googleGenerateContent
      .mockResolvedValueOnce({
        response: { text: () => JSON.stringify({
          ...base,
          transactions: [{
            date: "2026-09-20", description: "Compras regulares", amount: 1365.36,
            category: "Outros", billingStatus: "current", transactionKind: "purchase",
          }],
        }) },
      })
      .mockResolvedValueOnce({
        response: { text: () => JSON.stringify({
          ...base,
          transactions: [
            {
              date: "2026-09-20", description: "Compras regulares", amount: 1365.36,
              category: "Outros", billingStatus: "current", transactionKind: "purchase",
            },
            {
              date: "2026-09-10", description: "Loja financiada", amount: 850.15,
              category: "Moradia", billingStatus: "current", transactionKind: "purchase",
            },
          ],
        }) },
      });

    const result = await extractInvoiceTransactions(
      Buffer.from("pdf"), "application/pdf", undefined, "invoice-user", "banco-desconhecido.pdf",
    );
    expect(result).toMatchObject({ reconciled: true, statementTotal: 2215.51 });
    expect(result?.transactions.find(item => item.description === "Loja financiada")?.amount).toBe(850.15);
  });

  it("keeps a real single receipt out of the itemized invoice flow", async () => {
    googleGenerateContent.mockResolvedValueOnce({
      response: { text: () => '{"isInvoice":false}' },
    });

    await expect(extractInvoiceTransactions(
      Buffer.from("pdf"),
      "application/pdf",
      undefined,
      "invoice-user",
      "recibo.pdf",
    )).resolves.toBeNull();
    expect(googleGenerateContent).toHaveBeenCalledOnce();
  });

  it("fails closed after two malformed invoice responses", async () => {
    googleGenerateContent.mockResolvedValue({
      response: { text: () => '{"isInvoice":true,"transactions":[' },
    });

    await expect(extractInvoiceTransactions(
      Buffer.from("pdf"),
      "application/pdf",
      undefined,
      "invoice-user",
      "fatura.pdf",
    )).rejects.toThrow();
    expect(googleGenerateContent).toHaveBeenCalledTimes(2);
  });
});

describe("financial document installments", () => {
  it("keeps only the current installment amount and calculates how many remain", () => {
    const extracted = normalizeFinancialDocumentExtraction({
      isFinancial: true,
      type: "expense",
      amount: "2.000,00",
      installmentAmount: "200,00",
      description: "Geladeira",
      category: "Moradia",
      date: "2026-09-27",
      installmentCurrent: 3,
      installmentTotal: 10,
    }, "2026-09-28");

    expect(extracted).toMatchObject({
      amount: 200,
      installmentCurrent: 3,
      installmentTotal: 10,
      installmentsRemaining: 7,
    });
    expect(financialDocumentDescription(extracted!))
      .toBe("Geladeira · Parcela 3/10 · restantes 7");
  });

  it("does not confuse a date fraction with an installment", () => {
    const extracted = normalizeFinancialDocumentExtraction({
      isFinancial: true,
      type: "expense",
      amount: 80,
      description: "Compra realizada em 03/10",
      category: "Outros",
      date: "2026-10-03",
    }, "2026-09-28");
    expect(extracted).toMatchObject({ amount: 80 });
    expect(extracted).not.toHaveProperty("installmentCurrent");
    expect(extracted).not.toHaveProperty("installmentTotal");
  });

  it("extracts an explicit cuota fraction from a Spanish description", () => {
    const extracted = normalizeFinancialDocumentExtraction({
      isFinancial: true,
      amount: 50,
      description: "Nevera cuota 4/12",
      date: "2026-09-27",
    }, "2026-09-28");
    expect(extracted).toMatchObject({ installmentCurrent: 4, installmentTotal: 12, installmentsRemaining: 8 });
  });
});

describe("financial transaction lists", () => {
  it("keeps every visible income as an independent transaction", () => {
    const extracted = normalizeFinancialTransactionListExtraction({
      isTransactionList: true,
      bankName: "Banco Exemplo",
      sourceTransactionCount: 3,
      transactions: [
        { type: "income", amount: 1406.03, description: "Transferência recebida de Eva Santos Estética", category: "Serviços", date: "2026-09-17" },
        { type: "income", amount: 155.06, description: "iFood Pago Instituição de Pagamento", category: "Vendas", date: "2026-09-15" },
        { type: "income", amount: 3135.65, description: "Transferência recebida de Eva Santos Estética", category: "Serviços", date: "2026-09-12" },
      ],
    }, "2026-09-28");

    expect(extracted).toMatchObject({
      bankName: "Banco Exemplo",
      sourceTransactionCount: 3,
      complete: true,
    });
    expect(extracted?.transactions).toHaveLength(3);
    expect(extracted?.transactions.reduce((sum, item) => sum + item.amount, 0)).toBeCloseTo(4696.74, 2);
    expect(extracted?.transactions.every(item => item.type === "income")).toBe(true);
  });

  it("fails closed when one visible row was not fully read", () => {
    const extracted = normalizeFinancialTransactionListExtraction({
      isTransactionList: true,
      sourceTransactionCount: 3,
      transactions: [
        { type: "income", amount: 100, description: "PIX recebido", category: "Outros", date: "2026-09-20" },
        { type: "expense", amount: 20, description: "Tarifa", category: "Outros", date: "2026-09-20" },
      ],
    }, "2026-09-28");

    expect(extracted).toMatchObject({ sourceTransactionCount: 3, complete: false });
    expect(extracted?.transactions).toHaveLength(2);
  });

  it("does not treat a single receipt as a transaction list", () => {
    expect(normalizeFinancialTransactionListExtraction({
      isTransactionList: false,
      sourceTransactionCount: 1,
      transactions: [],
    }, "2026-09-28")).toBeNull();
  });
});
