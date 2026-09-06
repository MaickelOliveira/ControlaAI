import { describe, expect, it } from "vitest";
import {
  getExplicitDailySummaryResult,
  getExplicitGroceryListAddResult,
  getExplicitGroceryListManagementResult,
  getExplicitRelativePeriod,
  getExplicitTaskCreateResult,
  getExplicitUpcomingFinanceQueryResult,
  getExplicitVehicleCrudResult,
  getExplicitWeeklySummaryResult,
  getUnsupportedBankConnectionResponse,
  processMessage,
} from "./ai-processor";

describe("getExplicitTaskCreateResult", () => {
  it("creates the reported task even when the previous conversation was about banking", async () => {
    const result = await processMessage(
      "Tarefa. Tem que entregar a guitarra da Mariana amanhã.",
      {
        user: { activeMode: "personal", customCategoriesExpense: [], customCategoriesIncome: [], locale: "pt-BR" },
        history: [
          { role: "user", content: "Quero conectar minha conta bancária." },
          { role: "assistant", content: "O Zelo não utiliza Open Finance nem Open Banking." },
        ],
      },
    );

    expect(result).toMatchObject({
      intent: "task_create",
      confidence: 1,
      task: { title: "entregar a guitarra da Mariana", priority: "medium" },
    });
    expect(result.task?.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("leaves task updates and ambiguous weekday dates for the full classifier", () => {
    expect(getExplicitTaskCreateResult("Tarefa 2 concluída")).toBeNull();
    expect(getExplicitTaskCreateResult("Tarefa: entregar a guitarra na sexta-feira")).toBeNull();
  });
});

describe("getExplicitUpcomingFinanceQueryResult", () => {
  it("separates upcoming expenses from the historical monthly summary", async () => {
    const result = await processMessage("quais são as próximas despesas para pagar esse mês?");

    expect(result).toMatchObject({
      intent: "finance_upcoming",
      confidence: 1,
      financeType: "expense",
    });
  });

  it("recognizes the same request in Spanish", () => {
    expect(getExplicitUpcomingFinanceQueryResult("¿Cuáles son los próximos gastos por pagar este mes?"))
      .toMatchObject({ intent: "finance_upcoming", confidence: 1, financeType: "expense" });
    expect(getExplicitUpcomingFinanceQueryResult("¿Qué ingresos tengo por cobrar este mes?"))
      .toMatchObject({ intent: "finance_upcoming", confidence: 1, financeType: "income" });
  });

  it("keeps mutations and specific relative periods in the full classifier", () => {
    expect(getExplicitUpcomingFinanceQueryResult("registre uma conta para pagar")).toBeNull();
    expect(getExplicitUpcomingFinanceQueryResult("que contas tenho para pagar na semana que vem?")).toBeNull();
  });
});

describe("advisor summary classification", () => {
  it("treats a weekly summary as agenda, tasks and upcoming finances", async () => {
    expect(await processMessage("Resumo da semana")).toMatchObject({ intent: "weekly_summary", confidence: 1 });
    expect(getExplicitWeeklySummaryResult("Resumen de la semana"))
      .toMatchObject({ intent: "weekly_summary", confidence: 1 });
  });

  it("treats a daily summary the same way and preserves explicitly financial summaries", async () => {
    expect(await processMessage("Resumo do dia")).toMatchObject({ intent: "daily_summary", confidence: 1 });
    expect(getExplicitDailySummaryResult("Resumen de hoy"))
      .toMatchObject({ intent: "daily_summary", confidence: 1 });
    expect(getExplicitWeeklySummaryResult("Resumo financeiro da semana")).toBeNull();
    expect(getExplicitDailySummaryResult("Resumo financeiro do dia")).toBeNull();
  });

  it("uses the next calendar week in Portuguese and Spanish", () => {
    const sunday = new Date(2026, 8, 6, 12, 0, 0);
    const expected = { from: "2026-09-07", to: "2026-09-13" };

    expect(getExplicitWeeklySummaryResult("Resumo da semana que vem", sunday))
      .toMatchObject({ intent: "weekly_summary", period: expected });
    expect(getExplicitWeeklySummaryResult("Resumen de la próxima semana", sunday))
      .toMatchObject({ intent: "weekly_summary", period: expected });
  });

  it("resolves common relative periods from the São Paulo reference date", () => {
    const sunday = new Date(2026, 8, 6, 12, 0, 0);

    expect(getExplicitRelativePeriod("quanto gastei semana passada?", sunday))
      .toEqual({ from: "2026-08-24", to: "2026-08-30" });
    expect(getExplicitRelativePeriod("quanto vou gastar no mês que vem?", sunday))
      .toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(getExplicitRelativePeriod("o que recebi ontem?", sunday))
      .toEqual({ from: "2026-09-05", to: "2026-09-05" });
    expect(getExplicitRelativePeriod("gastos deste ano", sunday))
      .toEqual({ from: "2026-01-01", to: "2026-09-06" });
    expect(getExplicitDailySummaryResult("Resumo do dia de amanhã", sunday))
      .toMatchObject({ intent: "daily_summary", period: { from: "2026-09-07", to: "2026-09-07" } });
  });
});

describe("getExplicitGroceryListAddResult", () => {
  it("extracts items added to a supermarket list in Portuguese", async () => {
    expect(await processMessage("Adicione arroz, feijão e 2 leites na lista do supermercado"))
      .toMatchObject({
        intent: "grocery_list_add",
        confidence: 1,
        grocery: { items: [
          { productName: "arroz", category: "Mercearia" },
          { productName: "feijão", category: "Mercearia" },
          { productName: "leites", quantity: 2, category: "Laticínios" },
        ] },
      });
  });

  it("supports Spanish and ready-made category lists", () => {
    expect(getExplicitGroceryListAddResult("Agrega arroz y leche a mi lista de compras"))
      .toMatchObject({ intent: "grocery_list_add", grocery: { items: [
        { productName: "arroz", category: "Mercearia" },
        { productName: "leche", category: "Laticínios" },
      ] } });
    expect(getExplicitGroceryListAddResult("Põe a lista de limpeza na lista de compras"))
      .toMatchObject({ intent: "grocery_list_add", grocery: { template: "limpeza" } });
  });

  it("does not confuse viewing the list with adding an item", () => {
    expect(getExplicitGroceryListAddResult("O que tem na lista do supermercado?")).toBeNull();
  });

  it("understands creating a supermarket list even when products have no commas", () => {
    expect(getExplicitGroceryListAddResult(
      "Criar lista supermercado com amaciante Cotonete Inseticida tomada Alface Pão de forma Mussarela\\",
    )).toMatchObject({
      intent: "grocery_list_add",
      confidence: 1,
      grocery: {
        items: [
          { productName: "amaciante", category: "Limpeza" },
          { productName: "Cotonete", category: "Higiene" },
          { productName: "Inseticida", category: "Limpeza" },
          { productName: "tomada" },
          { productName: "Alface", category: "Hortifruti" },
          { productName: "Pão de forma", category: "Padaria" },
          { productName: "Mussarela", category: "Laticínios" },
        ],
      },
    });
  });
});

describe("getExplicitGroceryListManagementResult", () => {
  it("shows and clears the WhatsApp shopping list without using the AI fallback", async () => {
    expect(await processMessage("minha lista de compras"))
      .toMatchObject({ intent: "grocery_list_show", confidence: 1 });
    expect(await processMessage("limpe minha lista de compras"))
      .toMatchObject({ intent: "grocery_list_clear", confidence: 1 });
    expect(getExplicitGroceryListManagementResult("vaciar mi lista del supermercado"))
      .toMatchObject({ intent: "grocery_list_clear", confidence: 1 });
  });

  it("removes one or more named items", () => {
    expect(getExplicitGroceryListManagementResult("remova arroz e leite da minha lista de compras"))
      .toMatchObject({ intent: "grocery_list_remove", grocery: { itemNames: ["arroz", "leite"] } });
    expect(getExplicitGroceryListManagementResult("elimina pan de mi lista del supermercado"))
      .toMatchObject({ intent: "grocery_list_remove", grocery: { itemNames: ["pan"] } });
  });

  it("renames items and changes quantities or categories", () => {
    expect(getExplicitGroceryListManagementResult("mude arroz para arroz integral na lista de compras"))
      .toMatchObject({ intent: "grocery_list_edit", grocery: { itemNames: ["arroz"], newProductName: "arroz integral" } });
    expect(getExplicitGroceryListManagementResult("altere a quantidade do leite para 3 caixas na lista"))
      .toMatchObject({ intent: "grocery_list_edit", grocery: { itemNames: ["leite"], newQuantity: "3 caixas" } });
    expect(getExplicitGroceryListManagementResult("mude a categoria do sabonete para higiene na lista"))
      .toMatchObject({ intent: "grocery_list_edit", grocery: { itemNames: ["sabonete"], newCategory: "Higiene" } });
  });
});

describe("getUnsupportedBankConnectionResponse", () => {
  it("blocks invented bank connection instructions and points to in-app support", () => {
    const response = getUnsupportedBankConnectionResponse(
      "Não encontrei o local para conectar contas bancárias.",
    );

    expect(response).toContain("não é possível cadastrar nem conectar contas bancárias");
    expect(response).toContain("não utiliza Open Finance nem Open Banking");
    expect(response).toContain("*Suporte* no canto inferior direito");
    expect(response).not.toContain("Configurações");
    expect(response).not.toContain("Integrações Bancárias");
  });

  it("blocks direct Open Finance questions", () => {
    expect(getUnsupportedBankConnectionResponse("Como ativo o Open Finance?"))
      .toContain("*Suporte* no canto inferior direito");
    expect(getUnsupportedBankConnectionResponse("Como adicionar contas?"))
      .toContain("não é possível cadastrar nem conectar contas bancárias");
  });

  it("short-circuits processMessage without depending on the AI provider", async () => {
    const result = await processMessage("Onde conecto minha conta bancária?");

    expect(result).toMatchObject({ intent: "how_to", confidence: 1 });
    expect(result.response).toContain("*Suporte* no canto inferior direito");
  });

  it("understands a short follow-up from recent bank connection context", () => {
    const response = getUnsupportedBankConnectionResponse(
      "E onde faço isso?",
      "pt-BR",
      [{ role: "user", content: "Quero conectar minha conta bancária." }],
    );

    expect(response).toContain("não é possível cadastrar nem conectar contas bancárias");
  });

  it("does not let an old bank question hijack a new task or help request", () => {
    const bankHistory = [
      { role: "user" as const, content: "Quero conectar minha conta bancária." },
      { role: "assistant" as const, content: "O Zelo não utiliza Open Finance nem Open Banking." },
    ];

    expect(getUnsupportedBankConnectionResponse(
      "Tarefa: entregar a guitarra da Mariana amanhã.",
      "pt-BR",
      bankHistory,
    )).toBeNull();
    expect(getUnsupportedBankConnectionResponse("Ajuda", "pt-BR", bankHistory)).toBeNull();
    expect(getUnsupportedBankConnectionResponse("Onde encontro minhas tarefas?", "pt-BR", bankHistory)).toBeNull();
    expect(getUnsupportedBankConnectionResponse("Como conecto o Google Agenda?", "pt-BR", bankHistory)).toBeNull();
    expect(getUnsupportedBankConnectionResponse("Como acesso o painel?", "pt-BR", bankHistory)).toBeNull();
  });

  it("does not block normal financial records or Google integration help", () => {
    expect(getUnsupportedBankConnectionResponse("Gastei 50 no cartão Nubank")).toBeNull();
    expect(getUnsupportedBankConnectionResponse("Como conecto o Google Agenda?")).toBeNull();
    expect(getUnsupportedBankConnectionResponse("Como registrar a conta de luz?"))
      .toBeNull();
  });
});

describe("getExplicitVehicleCrudResult", () => {
  it("classifies a natural vehicle registration and extracts its main fields", () => {
    expect(getExplicitVehicleCrudResult("Cadastre um veículo Volkswagen Gol 2020 flex placa ABC1D23 com 45.000 km"))
      .toMatchObject({
        intent: "vehicle_create", confidence: 1,
        vehicle: {
          brand: "Volkswagen", model: "Gol", year: 2020, fuelType: "flex",
          plate: "ABC1D23", currentKm: 45000,
        },
      });
  });

  it("keeps a generic update actionable instead of returning silence", () => {
    expect(getExplicitVehicleCrudResult("Quero alterar meu veículo"))
      .toMatchObject({ intent: "vehicle_update", confidence: 1, vehicle: {} });
  });

  it("does not confuse the fuel type with an expense", () => {
    expect(getExplicitVehicleCrudResult("Cadastre um caminhão Volvo FH 2023 diesel"))
      .toMatchObject({ intent: "vehicle_create", vehicle: { brand: "Volvo", model: "FH", fuelType: "diesel" } });
  });

  it("extracts the target and new plate from an update", () => {
    expect(getExplicitVehicleCrudResult("Altere a placa do Gol para ABC1D23"))
      .toMatchObject({ intent: "vehicle_update", keyword: "Gol", vehicle: { plate: "ABC1D23" } });
  });

  it("extracts a vehicle deletion target", () => {
    expect(getExplicitVehicleCrudResult("Exclua o veículo Gol"))
      .toMatchObject({ intent: "vehicle_delete", keyword: "Gol", confidence: 1 });
  });

  it("does not confuse a vehicle expense with registration", () => {
    expect(getExplicitVehicleCrudResult("Registre um gasto de gasolina no carro")).toBeNull();
  });
});
