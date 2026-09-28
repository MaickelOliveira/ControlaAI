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

import { extractInvoiceTransactions, financialDocumentDescription, normalizeFinancialDocumentExtraction, processMessage } from "./ai-processor";

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
