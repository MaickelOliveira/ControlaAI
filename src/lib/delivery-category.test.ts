import { describe, expect, it, vi } from "vitest";
import { descriptionExpenseCategory, normalizeExpenseCategories } from "./expense-category";
import { createFinanceLedger, ledgerBalance, ledgerCategoryGroups, ledgerExpenseGroups, type RecordedFinance } from "./finance-ledger";
import { CATEGORIES_EXPENSE, translateCategory } from "./finances";
import type { AIResult } from "./ai-processor";
import type { BankMovement } from "./open-finance-report";

vi.mock("server-only", () => ({}));

const deliveryMerchants = [
  "iFood", "I Food", "IFD", "99Food", "99 Food", "Zé Delivery", "ZE*DELIVERY",
  "aiqfome", "ai que fome", "ai q fome", "Rappi", "Uber Eats", "Keeta",
  "Delivery Much", "Quero Delivery", "ToNoLucro", "Pede Pronto",
];

function newFinance(description: string, category = "Outros", type: "income" | "expense" = "expense"): AIResult {
  return {
    intent: "finance_register", confidence: 0.97,
    finance: {
      description, category, type, amount: 127.43, date: "2026-10-12", mode: "business",
      accountHint: "Conta fictícia", employeeName: "Funcionária fictícia",
    },
  };
}

function bankMovement(description: string, patch: Partial<BankMovement> = {}): BankMovement {
  return {
    id: "fictional-bank-movement", resource_id: "fictional-account", resource_name: "Conta fictícia",
    institution_name: "Banco fictício", resource_type: "account", date: "2026-10-12", description,
    amount: "127.43", currency: "BRL", direction: "debit", classification: "unknown", kind: "account_debits",
    source_category: "GENERAL_MERCHANDISE_OTHER", bill_month: null,
    installment_number: null, installment_count: null, ...patch,
  };
}

describe("Delivery describes identifiable food orders", () => {
  it.each(deliveryMerchants)("recognizes the food delivery merchant %s", description => {
    expect(descriptionExpenseCategory(description)).toBe("Delivery");
  });

  it.each([
    "Pedido de pizza para entrega", "Pedido de pizza por tele-entrega",
    "Pedido de esfiha para entrega", "Pedido de esfiha por tele-entrega",
    "Pedido de comida japonesa para entrega", "Pedido de comida japonesa por tele-entrega",
    "Pedido de sushi para entrega", "Pedido de sushi por tele-entrega",
    "Pedido de marmita para entrega", "Pedido de marmita por tele-entrega",
  ])("recognizes an explicit food order for delivery: %s", description => {
    expect(descriptionExpenseCategory(description)).toBe("Delivery");
  });

  it.each(["Marmita", "Padaria", "Mercado", "Refeição"])(
    "keeps ordinary food without delivery evidence in Alimentação: %s", description => {
      expect(descriptionExpenseCategory(description)).toBe("Alimentação");
    },
  );

  it.each(["99 corrida", "Uber corrida"])("keeps a ride in Transporte: %s", description => {
    expect(descriptionExpenseCategory(description)).toBe("Transporte");
  });

  it.each(["Amazon", "Mercado Pago"])("does not infer a food order from an intermediary: %s", description => {
    expect(descriptionExpenseCategory(description)).toBeNull();
  });

  it.each([
    "Rappi Pay", "RAPPI*PAY", "Delivery de medicamento", "Delivery de medicamentos",
    "Delivery de roupas", "Entrega de roupas", "Tele-entrega de medicamentos",
  ])("does not label a payment service or non-food delivery as Delivery: %s", description => {
    expect(descriptionExpenseCategory(description)).not.toBe("Delivery");
    const [entry] = createFinanceLedger([], [bankMovement(description)], "personal");
    expect(entry.category).not.toBe("Delivery");
  });

  it.each([
    "IOF iFood", "Juros do cartão Zé Delivery", "Tarifa bancária Rappi",
    "Anuidade do cartão Uber Eats", "Encargos financeiros 99 Food",
  ])("keeps banking charges ahead of merchant rules: %s", description => {
    expect(descriptionExpenseCategory(description)).toBe("Encargos bancários");
    const [entry] = createFinanceLedger([], [bankMovement(description)], "personal");
    expect(entry.category).toBe("Encargos bancários");
  });
});

describe("new WhatsApp expenses can use Delivery without overwriting the person", () => {
  it.each(deliveryMerchants)("normalizes a new %s expense while preserving its other fields", description => {
    const original = newFinance(description, "Alimentação");
    const before = structuredClone(original);
    const normalized = normalizeExpenseCategories(`Paguei 127,43 no ${description}`, original);
    expect(normalized).toEqual({...original, finance: {...original.finance, category: "Delivery"}});
    expect(original).toEqual(before);
  });

  it.each(["Alimentação", "Evento empresa"])("preserves an explicitly selected %s category", category => {
    const original = newFinance("iFood", category);
    expect(normalizeExpenseCategories(`Paguei 127,43 no iFood na categoria ${category}`, original)).toEqual(original);
  });

  it("preserves a delivery merchant on an income record", () => {
    const original = newFinance("Uber Eats", "Vendas", "income");
    expect(normalizeExpenseCategories("Recebi 127,43 do Uber Eats", original)).toEqual(original);
  });

  it("preserves an existing record during an edit", () => {
    const original: AIResult = {...newFinance("Zé Delivery", "Alimentação"), intent: "finance_edit"};
    expect(normalizeExpenseCategories("Altere o valor do Zé Delivery para 127,43", original)).toBe(original);
  });

  it("normalizes each new expense independently while preserving a chosen category and income in the same batch", () => {
    const original: AIResult = {
      intent: "finance_register", confidence: 0.97,
      finances: [
        newFinance("iFood", "Alimentação").finance!,
        newFinance("Sushi").finance!,
        newFinance("Rappi", "Evento empresa").finance!,
        newFinance("Uber Eats", "Vendas", "income").finance!,
      ],
    };
    const before = structuredClone(original);
    const normalized = normalizeExpenseCategories(
      "Paguei 127,43 no iFood; 127,43 de sushi; 127,43 no Rappi na categoria Evento empresa; recebi 127,43 do Uber Eats",
      original,
    );
    expect(normalized).toEqual({
      ...original, finances: original.finances!.map((finance, index) => ({
        ...finance, category: ["Delivery", "Delivery", "Evento empresa", "Vendas"][index],
      })),
    });
    expect(original).toEqual(before);
  });
});

describe("bank Delivery categorization preserves financial accounting", () => {
  it.each([
    {name: "account debit", resource_type: "account", direction: "debit", kind: "account_debits", amount: 127.43},
    {name: "card purchase", resource_type: "card", direction: "debit", kind: "card_purchases", amount: 127.43},
    {name: "card refund", resource_type: "card", direction: "credit", kind: "credits", amount: -127.43},
  ] as const)("categorizes a $name and preserves its signed amount and origin", sample => {
    const movement = bankMovement("IFD", {
      resource_type: sample.resource_type, direction: sample.direction, kind: sample.kind,
      classification: sample.resource_type === "card" ? "purchase" : "unknown",
    });
    const before = structuredClone(movement);
    const [entry] = createFinanceLedger([], [movement], "business");
    expect(entry).toMatchObject({
      id: "bank:fictional-bank-movement", type: "expense", category: "Delivery", categorySource: "description",
      amount: sample.amount, included: true, mode: "business", source: "bank", date: "2026-10-12", bank: before,
    });
    expect(entry.bank).toBe(movement);
    expect(movement).toEqual(before);
    expect(ledgerBalance([entry])).toEqual({income: 0, expense: sample.amount, balance: -sample.amount});
  });

  it("keeps the account owner's selected category above Delivery and provider enrichment", () => {
    const movement = bankMovement("iFood", {user_category: "Evento empresa", source_category: "FOOD_AND_DRINK"});
    const [entry] = createFinanceLedger([], [movement], "personal");
    expect(entry).toMatchObject({
      category: "Evento empresa", categorySource: "user", amount: 127.43, included: true, bank: movement,
    });
  });

  it("keeps excluded transfers excluded despite a delivery merchant and a selected category", () => {
    const movement = bankMovement("Zé Delivery", {
      kind: "excluded", classification: "transfer", user_category: "Delivery",
    });
    const [entry] = createFinanceLedger([], [movement], "personal");
    expect(entry).toMatchObject({
      category: "Transferências e pagamentos", categorySource: "excluded", amount: 127.43, included: false, bank: movement,
    });
    expect(ledgerBalance([entry])).toEqual({income: 0, expense: 0, balance: 0});
  });

  it("keeps an account credit in its income category despite a delivery merchant", () => {
    const movement = bankMovement("Rappi", {
      direction: "credit", kind: "credits", source_category: "INCOME_CONTRACTOR",
    });
    const [entry] = createFinanceLedger([], [movement], "personal");
    expect(entry).toMatchObject({type: "income", category: "Freelance", amount: 127.43, included: true});
  });

  it("combines Delivery amounts and refunds once per bank ID without changing totals or manually selected categories", () => {
    const records: RecordedFinance[] = [
      {id: "fictional-whatsapp-expense", type: "expense", amount: 20, category: "Delivery", description: "iFood",
        date: "2026-10-12", mode: "personal", source: "whatsapp"},
      {id: "fictional-existing-expense", type: "expense", amount: 5, category: "Alimentação", description: "Rappi",
        date: "2026-10-12", mode: "personal", source: "web"},
      {id: "fictional-income", type: "income", amount: 200, category: "Vendas", description: "Pedido recebido",
        date: "2026-10-12", mode: "personal", source: "whatsapp"},
    ];
    const account = bankMovement("iFood", {id: "fictional-debit", amount: "70.25"});
    const purchase = bankMovement("99Food", {
      id: "fictional-purchase", amount: "49.75", resource_type: "card", kind: "card_purchases", classification: "purchase",
    });
    const refund = bankMovement("Estorno Uber Eats", {
      id: "fictional-refund", amount: "9.50", resource_type: "card", direction: "credit", kind: "credits",
    });
    const chosen = bankMovement("Keeta", {id: "fictional-chosen", amount: "40.00", user_category: "Evento empresa"});
    const excluded = bankMovement("Zé Delivery", {
      id: "fictional-transfer", amount: "999.00", kind: "excluded", classification: "transfer",
    });
    const movements = [account, purchase, {...purchase}, refund, chosen, excluded];
    const beforeRecords = structuredClone(records), beforeMovements = structuredClone(movements);
    const entries = createFinanceLedger(records, movements, "personal");

    expect(entries).toHaveLength(8);
    expect(entries.filter(entry => entry.id === "bank:fictional-purchase")).toHaveLength(1);
    expect(entries.find(entry => entry.id === "fictional-existing-expense")).toMatchObject({category: "Alimentação", amount: 5});
    expect(entries.find(entry => entry.id === "bank:fictional-refund")).toMatchObject({category: "Delivery", type: "expense", amount: -9.5});
    expect(ledgerBalance(entries)).toEqual({income: 200, expense: 175.5, balance: 24.5});
    expect(ledgerExpenseGroups(entries, "category")).toEqual(expect.arrayContaining([
      {name: "Delivery", value: 130.5}, {name: "Evento empresa", value: 40}, {name: "Alimentação", value: 5},
    ]));
    expect(ledgerExpenseGroups(entries, "category")).toHaveLength(3);
    expect(ledgerCategoryGroups(entries, "expense")).toEqual([
      {name: "Delivery", value: 130.5}, {name: "Evento empresa", value: 40}, {name: "Alimentação", value: 5},
    ]);
    expect(ledgerCategoryGroups(entries, "income")).toEqual([{name: "Vendas", value: 200}]);
    expect(records).toEqual(beforeRecords);
    expect(movements).toEqual(beforeMovements);
  });
});

describe("Delivery is an available expense category with aligned display translations", () => {
  it("exposes Delivery once and provides a usable label in each supported locale", () => {
    expect(CATEGORIES_EXPENSE.filter(category => category === "Delivery")).toHaveLength(1);
    for (const locale of ["pt-BR", "es", "pt-PT"]) {
      const label = translateCategory("Delivery", "expense", locale);
      expect(typeof label).toBe("string");
      expect(label.trim().length).toBeGreaterThan(0);
    }
  });

  it.each([
    ["Alimentação", "Alimentación", "Alimentação"], ["Transporte", "Transporte", "Transporte"],
    ["Moradia", "Vivienda", "Habitação"], ["Saúde", "Salud", "Saúde"], ["Educação", "Educación", "Educação"],
    ["Lazer", "Ocio", "Lazer"], ["Vestuário", "Ropa", "Vestuário"], ["Tecnologia", "Tecnología", "Tecnologia"],
    ["Serviços", "Servicios", "Serviços"], ["Impostos", "Impuestos", "Impostos"],
    ["Encargos bancários", "Cargos bancarios", "Encargos bancários"], ["Funcionários", "Empleados", "Funcionários"],
    ["Marketing", "Marketing", "Marketing"], ["Fornecedores", "Proveedores", "Fornecedores"], ["Outros", "Otros", "Outros"],
    ["Transferência", "Transferencia", "Transferência"], ["Empréstimos", "Préstamos", "Empréstimos"],
    ["Inteligência Artificial", "Inteligencia Artificial", "Inteligência Artificial"],
  ])("keeps the existing translation of %s aligned when Delivery is added", (category, spanish, portuguese) => {
    expect(translateCategory(category, "expense", "es")).toBe(spanish);
    expect(translateCategory(category, "expense", "pt-PT")).toBe(portuguese);
  });
});
