import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
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

  it("assinatura cancelada sai da previsão quando a cobrança do mês não vem", () => {
    const history = [charge("2026-09-05", "Academia Fit", "99.90"), charge("2026-10-05", "Academia Fit", "99.90")];
    // Hoje é 22/11: a cobrança de 05/11 não veio até 15/11.
    expect(detectSubscriptions({ history, period: december, today })).toEqual([]);
    // Ainda dentro do prazo do cartão lançar, continua prevista.
    expect(detectSubscriptions({ history, period: december, today: "2026-11-12" })).toHaveLength(1);
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

  it("não trata juros, multa e IOF de atraso nem lanches como conta mensal", () => {
    const twice = (description: string, amount: string, extra: Partial<BankMovement> = {}) =>
      [charge("2026-10-16", description, amount, extra), charge("2026-11-16", description, amount, extra)];
    const found = detectSubscriptions({
      history: [
        ...twice("Juros do rotativo", "33.37", { user_category: null }), ...twice("Multa por atraso", "55.37", { user_category: null }),
        ...twice("IOF do rotativo", "11.10", { user_category: null }), ...twice("SILVIO LANCHES", "108.00", { user_category: null }),
        ...twice("Restaurante Bom Prato", "60.00", { user_category: "Alimentação" }),
        ...twice("iFood Club", "8.08", { user_category: null }), ...twice("TARIFA PACOTE", "101.71", { user_category: null }),
      ],
      period: december, today,
    });
    expect(found.map(item => item.description).sort()).toEqual(["TARIFA PACOTE", "iFood Club"]);
  });

  it("ChatGPT e Claude cobrados todo mês sempre entram, mesmo com categoria errada no extrato", () => {
    const found = detectSubscriptions({
      history: [
        charge("2026-10-17", "OPENAI *CHATGPT SUBSCR", "543.38", { user_category: "Delivery" }),
        charge("2026-11-17", "OPENAI *CHATGPT SUBSCR", "543.38", { user_category: "Delivery" }),
        charge("2026-10-11", "CLAUDE.AI SUBSCRIPTION", "113.85", { user_category: null }),
        charge("2026-11-11", "CLAUDE.AI SUBSCRIPTION", "113.85", { user_category: null }),
      ],
      period: december, today,
    });
    expect(found.map(item => [item.date, item.amount])).toEqual([["2026-12-11", 113.85], ["2026-12-17", 543.38]]);
  });

  it("qualquer cobrança nova só vira conta mensal a partir da segunda vez", () => {
    const first = [charge("2026-11-05", "Academia Fit", "99.90", { user_category: null })];
    expect(detectSubscriptions({ history: first, period: december, today })).toEqual([]);
    const second = [charge("2026-10-05", "Academia Fit", "99.90", { user_category: null }), ...first];
    expect(detectSubscriptions({ history: second, period: december, today })).toEqual([expect.objectContaining({ description: "Academia Fit", date: "2026-12-05" })]);
  });

  it("uma cobrança pequena com o mesmo nome no mês não anula a assinatura (Google One R$ 96,99 + R$ 1,00)", () => {
    const found = detectSubscriptions({
      history: [
        charge("2026-09-12", "Google One", "96.99"), charge("2026-09-23", "Google One", "1.00"),
        charge("2026-10-12", "Google One", "96.99"), charge("2026-10-23", "Google One", "1.00"),
      ],
      period: december, today,
    });
    expect(found.map(item => [item.date, item.amount])).toEqual([["2026-12-12", 96.99], ["2026-12-23", 1]]);
    expect(new Set(found.map(item => item.id)).size).toBe(2);
  });

  it("empresa: pagamento fixo por Pix e parcela de empréstimo entram; Pix de valores variados não", () => {
    const pix = (date: string, description: string, amount: string) => charge(date, description, amount,
      { resource_id: "acc", resource_type: "account", institution_name: "Nubank", resource_name: "Conta PJ", kind: "account_debits", user_category: null });
    const found = detectSubscriptions({
      history: [
        pix("2026-09-14", "Transferência enviada pelo Pix REALIZE CREDITO", "211.76"), pix("2026-10-13", "Transferência enviada pelo Pix REALIZE CREDITO", "211.76"),
        pix("2026-11-13", "Transferência enviada pelo Pix REALIZE CREDITO", "211.76"),
        pix("2026-10-21", "Parcela paga - Capital de giro", "2228.99"), pix("2026-11-21", "Parcela paga - Capital de giro", "2228.99"),
        pix("2026-10-10", "Transferência enviada pelo Pix HAVAN", "801.56"), pix("2026-11-10", "Transferência enviada pelo Pix HAVAN", "659.57"),
      ],
      period: december, today,
    });
    expect(found.map(item => [item.description, item.date, item.category, !!item.loan])).toEqual([
      ["Transferência enviada pelo Pix REALIZE CREDITO", "2026-12-13", "Outros", false],
      ["Parcela paga - Capital de giro", "2026-12-21", "Empréstimos", true],
    ]);
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

  it("recorrência que o banco informa só até este mês continua no mês seguinte", async () => {
    const { financePeriodExpenses } = await import("./finance-period-expenses");
    const item = (id: string, description: string, due: string, amount: string, institution = "Mercado Pago") => ({ id, kind: "recurring", description, resource_id: "card-mp",
      resource_name: institution, institution_name: institution, due_date: due, amount, currency: "BRL", synced_at: "2026-11-22", user_category: "Assinaturas" });
    const ledger = {
      finances: [], installmentAnchors: { items: [], incomplete: false },
      bank: { report: { movements: [] }, overview: { resources: [], credit: [], connections: [], loans: [], financings: [], agenda: { incomplete: false, items: [
        item("g", "Google", "2026-11-12", "96.99"), item("old", "Google One", "2026-01-12", "96.99", "Nubank"), item("j", "Juros do rotativo", "2026-11-16", "33.37"),
      ] } } },
    } as unknown as Parameters<typeof financePeriodExpenses>[0];
    const { subscriptions, expensePlan } = financePeriodExpenses(ledger, [], { ...december, type: "expense", categories: [], search: "", account: "" } as never, today, []);
    expect(subscriptions).toEqual([expect.objectContaining({ description: "Google", amount: 96.99, date: "2026-12-12" })]);
    expect(expensePlan.forecast).toBe(96.99);
  });

  it("parcela de empréstimo reconhecida entra em Empréstimos só quando o banco não informa o empréstimo", async () => {
    const { financePeriodExpenses } = await import("./finance-period-expenses");
    const history = [
      charge("2026-10-21", "Parcela paga - Capital de giro", "2228.99", { kind: "account_debits", resource_type: "account", user_category: null }),
      charge("2026-11-21", "Parcela paga - Capital de giro", "2228.99", { kind: "account_debits", resource_type: "account", user_category: null }),
    ];
    const ledger = {
      finances: [], installmentAnchors: { items: [], incomplete: false },
      bank: { report: { movements: [] }, overview: { resources: [], credit: [], connections: [], loans: [], financings: [], agenda: { incomplete: false, items: [] } } },
    } as unknown as Parameters<typeof financePeriodExpenses>[0];
    const { expensePlan } = financePeriodExpenses(ledger, [], { ...december, type: "expense", categories: [], search: "", account: "" } as never, today, history);
    expect(expensePlan.groups).toEqual([expect.objectContaining({ name: "Empréstimos", forecast: 2228.99 })]);
    expect(expensePlan.forecastItems).toEqual([expect.objectContaining({ description: "Parcela paga - Capital de giro · parcela de empréstimo" })]);
  });

  it("assinatura antiga continua nos próximos 5 meses, venha do banco ou das cobranças", async () => {
    const { financePeriodExpenses } = await import("./finance-period-expenses");
    const history = [charge("2026-09-17", "OPENAI CHATGPT SUBSCR", "543.38"), charge("2026-10-17", "OPENAI CHATGPT SUBSCR", "543.38"), charge("2026-11-17", "OPENAI CHATGPT SUBSCR", "543.38")];
    const ledger = {
      finances: [], installmentAnchors: { items: [], incomplete: false },
      bank: { report: { movements: [] }, overview: { resources: [], credit: [], connections: [], loans: [], financings: [], agenda: { incomplete: false, items: [
        { id: "a", kind: "recurring", description: "Anthropic", resource_id: "card-mp", resource_name: "Mercado Pago", institution_name: "Mercado Pago",
          due_date: "2026-12-11", amount: "113.85", currency: "BRL", synced_at: "2026-11-22", user_category: "Inteligência Artificial" },
      ] } } },
    } as unknown as Parameters<typeof financePeriodExpenses>[0];
    for (const period of [{ from: "2027-01-01", to: "2027-01-31" }, { from: "2027-02-01", to: "2027-02-28" }]) {
      const { subscriptions } = financePeriodExpenses(ledger, [], { ...period, type: "expense", categories: [], search: "", account: "" } as never, today, history);
      expect(subscriptions.map(item => [item.description, item.date.slice(8)])).toEqual([["Anthropic", "11"], ["OPENAI CHATGPT SUBSCR", "17"]]);
    }
    // Até 5 meses à frente: abril entra, maio não.
    const april = financePeriodExpenses(ledger, [], { from: "2027-04-01", to: "2027-04-30", type: "expense", categories: [], search: "", account: "" } as never, today, history);
    expect(april.subscriptions).toHaveLength(2);
    const may = financePeriodExpenses(ledger, [], { from: "2027-05-01", to: "2027-05-31", type: "expense", categories: [], search: "", account: "" } as never, today, history);
    expect(may.subscriptions).toEqual([]);
  });

  it("tira da previsão juros de atraso e lanches que o banco marca como recorrentes", async () => {
    const { financePeriodExpenses } = await import("./finance-period-expenses");
    const item = (id: string, description: string, amount: string) => ({ id, kind: "recurring", description, resource_id: "card-mp", resource_name: "Mercado Pago",
      institution_name: "Mercado Pago", due_date: "2026-12-16", amount, currency: "BRL", synced_at: "2026-11-22" });
    const ledger = {
      finances: [], installmentAnchors: { items: [], incomplete: false },
      bank: { report: { movements: [] }, overview: { resources: [], credit: [], connections: [], loans: [], financings: [], agenda: { incomplete: false, items: [
        item("j", "Juros do rotativo", "33.37"), item("m", "Multa por atraso", "55.37"), item("l", "SILVIO LANCHES", "108.00"), item("n", "Netflix", "20.90"),
      ] } } },
    } as unknown as Parameters<typeof financePeriodExpenses>[0];
    const { bankSchedules, expensePlan } = financePeriodExpenses(ledger, [], { ...december, type: "expense", categories: [], search: "", account: "" } as never, today, []);
    expect(bankSchedules.map(row => row.description)).toEqual(["Netflix"]);
    expect(expensePlan.forecast).toBe(20.9);
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

describe("contas mensais por nome", () => {
  it("lista as recorrências do banco no período e as assinaturas reconhecidas, por data", async () => {
    const { monthlyBills } = await import("./finance-planning-whatsapp");
    const subscriptions = detectSubscriptions({
      history: [charge("2026-09-17", "OPENAI CHATGPT SUBSCR", "543.38"), charge("2026-10-17", "OPENAI CHATGPT SUBSCR", "543.38")],
      period: december, today,
    });
    const bills = monthlyBills([
      { id: "a", kind: "recurring", description: "Anthropic", resource_name: "MP", institution_name: "Mercado Pago", due_date: "2026-12-11", amount: "113.85", currency: "BRL", synced_at: "2026-11-22" },
      { id: "b", kind: "recurring", description: "Antiga", resource_name: "MP", institution_name: "Mercado Pago", due_date: "2026-11-02", amount: "10.00", currency: "BRL", synced_at: "2026-11-22" },
      { id: "c", kind: "installment", description: "Geladeira", resource_name: "MP", institution_name: "Mercado Pago", due_date: "2026-12-05", amount: "300.00", currency: "BRL", synced_at: "2026-11-22" },
    ], subscriptions, december);
    expect(bills).toEqual([
      { description: "Anthropic", amount: 113.85, date: "2026-12-11" },
      { description: "OPENAI CHATGPT SUBSCR", amount: 543.38, date: "2026-12-17" },
    ]);
  });
});
