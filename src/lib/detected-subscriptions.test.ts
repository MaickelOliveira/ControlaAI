import { describe, expect, it } from "vitest";
import { detectSubscriptions, subscriptionKey } from "./detected-subscriptions";
import { financeExpensePlan } from "./finance-expense-plan";
import { cashProjection, projectionReply } from "./cash-projection";
import type { BankMovement } from "./open-finance-report";

const charge = (date: string, description: string, amount: string, extra: Partial<BankMovement> = {}): BankMovement => ({
  id: `${description}-${date}`, resource_id: "card-mp", resource_name: "Mercado Pago", institution_name: "Mercado Pago",
  resource_type: "credit_card", date, description, amount, currency: "BRL", direction: "debit", classification: "purchase",
  kind: "card_purchases", user_category: "Inteligência Artificial", bill_month: null, installment_number: null, installment_count: null,
  ...extra,
});
const december = { from: "2026-12-01", to: "2026-12-31" };
const today = "2026-11-22";

describe("detecção de assinaturas mensais", () => {
  it("prevê o ChatGPT cobrado todo mês no cartão, mesmo sem o banco marcar como recorrente", () => {
    const found = detectSubscriptions({
      history: [charge("2026-09-17", "OPENAI  CHATGPT SUBSCR", "543.38"), charge("2026-10-17", "OPENAI  CHATGPT SUBSCR", "543.38")],
      period: december, today,
    });
    expect(found).toEqual([expect.objectContaining({ description: "OPENAI CHATGPT SUBSCR", amount: 543.38, date: "2026-12-17", category: "Inteligência Artificial" })]);
  });

  it("aceita pequenas variações de valor e de dia", () => {
    const found = detectSubscriptions({
      history: [charge("2026-09-15", "Spotify", "21.90"), charge("2026-10-17", "Spotify", "22.90"), charge("2026-11-16", "Spotify", "22.90")],
      period: december, today,
    });
    expect(found).toHaveLength(1);
    expect(found[0].date).toBe("2026-12-16");
  });

  it("não inventa assinatura de compras isoladas, repetidas no mês, parceladas ou com valor muito diferente", () => {
    const found = detectSubscriptions({
      history: [
        charge("2026-10-03", "Loja Avulsa", "80.00"),
        charge("2026-10-05", "Mercado X", "120.00"), charge("2026-10-20", "Mercado X", "90.00"), charge("2026-11-06", "Mercado X", "110.00"),
        charge("2026-09-10", "Geladeira", "300.00", { installment_count: 10, installment_number: 1 }),
        charge("2026-10-10", "Geladeira", "300.00", { installment_count: 10, installment_number: 2 }),
        charge("2026-09-08", "Posto Shell", "150.00"), charge("2026-10-08", "Posto Shell", "60.00"),
      ],
      period: december, today,
    });
    expect(found).toEqual([]);
  });

  it("não repete o que o banco ou a Zelo já preveem", () => {
    const history = [charge("2026-09-11", "Anthropic", "113.85"), charge("2026-10-11", "Anthropic", "113.85")];
    expect(detectSubscriptions({ history, period: december, today, bankSchedules: [{ kind: "recurring", description: "ANTHROPIC" }] })).toEqual([]);
    expect(detectSubscriptions({ history, period: december, today, knownDescriptions: ["Anthropic Claude"] })).toEqual([]);
  });

  it("considera encerrada a assinatura sem cobrança há mais de dois meses", () => {
    const history = [charge("2026-07-17", "Netflix", "39.90"), charge("2026-08-17", "Netflix", "39.90")];
    expect(detectSubscriptions({ history, period: december, today })).toEqual([]);
  });

  it("junta as cobranças do mesmo banco mesmo quando o cartão muda de identificador", () => {
    const found = detectSubscriptions({
      history: [
        charge("2026-09-17", "OPENAI  CHATGPT SUBSCR", "543.38", { resource_id: "card-a", direction: "unknown" }),
        charge("2026-10-17", "OPENAI  CHATGPT SUBSCR", "543.38", { resource_id: "card-b", direction: "unknown" }),
      ],
      period: december, today,
    });
    expect(found).toEqual([expect.objectContaining({ amount: 543.38, date: "2026-12-17" })]);
  });

  it("usa a categoria traduzida do extrato, não o código do banco", () => {
    const found = detectSubscriptions({
      history: [
        charge("2026-10-05", "TARIFA PACOTE", "101.71", { user_category: null, source_category: "BANK_FEES_OTHER_BANK_FEES" }),
        charge("2026-11-05", "TARIFA PACOTE", "101.71", { user_category: null, source_category: "BANK_FEES_OTHER_BANK_FEES" }),
      ],
      period: december, today,
    });
    expect(found[0].category).toBe("Encargos bancários");
  });

  it("normaliza a descrição para comparar a mesma cobrança", () => {
    expect(subscriptionKey("OPENAI *CHATGPT SUBSCR 123")).toBe(subscriptionKey("Openai  ChatGPT"));
  });

  it("soma a assinatura detectada na previsão de despesas", () => {
    const subscriptions = detectSubscriptions({
      history: [charge("2026-09-17", "OPENAI CHATGPT SUBSCR", "543.38"), charge("2026-10-17", "OPENAI CHATGPT SUBSCR", "543.38")],
      period: december, today,
    });
    const plan = financeExpensePlan({ posted: [], pending: [], recurring: [], loans: [], installments: [], schedules: [], subscriptions, ...december });
    expect(plan.forecast).toBe(543.38);
    expect(plan.groups).toEqual([expect.objectContaining({ name: "Inteligência Artificial", forecast: 543.38 })]);
  });
});

describe("assinatura que o banco conhece só até o mês atual", () => {
  it("é prevista no mês seguinte pelas previsões do período", async () => {
    const { financePeriodExpenses } = await import("./finance-period-expenses");
    const history = [charge("2026-09-17", "OPENAI CHATGPT SUBSCR", "543.38"), charge("2026-10-17", "OPENAI CHATGPT SUBSCR", "543.38")];
    const ledger = {
      finances: [], installmentAnchors: { items: [], incomplete: false },
      bank: { report: { movements: [] }, overview: { resources: [], credit: [], connections: [], loans: [], financings: [], agenda: { incomplete: false, items: [
        { id: "s1", kind: "recurring", description: "OPENAI CHATGPT", resource_id: "card-mp", resource_name: "Mercado Pago", institution_name: "Mercado Pago",
          due_date: "2026-11-17", amount: "543.38", currency: "BRL", synced_at: "2026-11-22" },
      ] } } },
    } as unknown as Parameters<typeof financePeriodExpenses>[0];
    const { expensePlan } = financePeriodExpenses(ledger, [], { ...december, type: "expense", categories: [], search: "", account: "" } as never, today, history);
    expect(expensePlan.forecastItems).toEqual([expect.objectContaining({ amount: 543.38 })]);
  });
});

describe("projeção com as previsões dos bancos", () => {
  it("\"quanto começo devendo\" inclui empréstimos, parcelas e assinaturas", () => {
    const base = cashProjection([], [], "personal", december, today);
    const reply = projectionReply(base, "personal", december, "pt-BR", {
      forecastCents: 604_082, groups: [["Empréstimos", 216_642], ["Parcelados", 155_403]], unquantified: 0, incomplete: false,
    }).replace(/ /g, " ");
    expect(reply).toContain("Previsto pelos bancos (empréstimos, parcelas e assinaturas): R$ 6.040,82");
    expect(reply).toContain("Empréstimos: R$ 2.166,42");
    expect(reply).toMatch(/Saldo final projetado: -R\$\s?6\.040,82/);
    expect(reply).toContain("previsões dos bancos conectados");
  });

  it("sem banco conectado, a projeção continua só com os registros da Zelo", () => {
    const reply = projectionReply(cashProjection([], [], "personal", december, today), "personal", december, "pt-BR", null);
    expect(reply).not.toContain("Previsto pelos bancos");
    expect(reply).toContain("Base: lançamentos e compromissos cadastrados na Zelo.");
  });
});
