import { describe, expect, it } from "vitest";
import {
  getExplicitDailySummaryResult,
  getExplicitFinanceDetailResult,
  getExplicitFinanceTypeSignal,
  getExplicitGroceryListAddResult,
  getExplicitGroceryListManagementResult,
  getExplicitGroceryHistoryQueryResult,
  getExplicitLastGroceryPurchaseResult,
  getExplicitRelativePeriod,
  getExplicitTaskCreateResult,
  getExplicitTaskListCreateResult,
  getExplicitScheduledReminderResult,
  getExplicitUpcomingFinanceQueryResult,
  getExplicitUnscheduledReminderResult,
  getExplicitVehicleCrudResult,
  getExplicitWebSearchResult,
  getWebSearchMissingQuestion,
  getExplicitWeeklySummaryResult,
  getUnsupportedBankConnectionResponse,
  processMessage,
  withExplicitFinanceDestinationMode,
  withExplicitFinanceType,
} from "./ai-processor";

describe("internet research classification", () => {
  it("routes explicit web research in Portuguese and Spanish", async () => {
    expect(getExplicitWebSearchResult("Pesquise na internet o preço do medicamento X"))
      .toMatchObject({ intent: "web_search", confidence: 1 });
    expect(await processMessage("Busca en internet horarios de vuelos a Bogotá"))
      .toMatchObject({ intent: "web_search", confidence: 1 });
  });

  it("routes short current lookups of every kind without requiring the word internet", async () => {
    expect(getExplicitWebSearchResult("Balneário Camboriú hoje"))
      .toMatchObject({ intent: "web_search", confidence: 1, keyword: "Balneário Camboriú hoje" });
    expect(getExplicitWebSearchResult("dólar hoje"))
      .toMatchObject({ intent: "web_search", confidence: 1, keyword: "dólar hoje" });
    expect(getExplicitWebSearchResult("clima en Bogotá"))
      .toMatchObject({ intent: "web_search", confidence: 1, keyword: "clima en Bogotá" });
    expect(await processMessage("eventos en Ciudad de México hoy"))
      .toMatchObject({ intent: "web_search", confidence: 1 });
  });

  it("does not steal finance, reminder, task or agenda messages that mention today", () => {
    expect(getExplicitWebSearchResult("Gastei 60 na farmácia hoje")).toBeNull();
    expect(getExplicitWebSearchResult("me lembre do dólar hoje às 18h")).toBeNull();
    expect(getExplicitWebSearchResult("tarefa de hoje: pesquisar hotéis")).toBeNull();
    expect(getExplicitWebSearchResult("tenho reunião hoje em Bogotá")).toBeNull();
    expect(getExplicitWebSearchResult("qual meu saldo hoje?")).toBeNull();
  });

  it("does not confuse an internal Drive search with a web search", () => {
    expect(getExplicitWebSearchResult("Busque meu contrato no Drive")).toBeNull();
  });

  it("keeps an instruction to research later as a reminder", async () => {
    expect(await processMessage("Me lembre amanhã às 9h de pesquisar o preço na internet"))
      .toMatchObject({ intent: "reminder_set" });
  });

  it("asks for the date before searching flight availability", () => {
    expect(getWebSearchMissingQuestion("Pesquise passagens de Guarulhos para Belo Horizonte", "pt-BR"))
      .toContain("qual data");
    expect(getWebSearchMissingQuestion("Busca vuelos de Bogotá a Santiago el 20/09/2026", "es"))
      .toBeNull();
  });
});

describe("explicit finance type", () => {
  it("recognizes natural income and expense language in Portuguese and Spanish", () => {
    expect(getExplicitFinanceTypeSignal("Comprei livros no valor de 108 reais pela conta da empresa")).toBe("expense");
    expect(getExplicitFinanceTypeSignal("Paguei a mensalidade e gastei 80 reais")).toBe("expense");
    expect(getExplicitFinanceTypeSignal("Compré libros por 108 dólares para la empresa")).toBe("expense");
    expect(getExplicitFinanceTypeSignal("Recebi 900 reais de comissão")).toBe("income");
    expect(getExplicitFinanceTypeSignal("Me pagaron 500 dólares por el servicio")).toBe("income");
  });

  it("treats a received bill as an expense and leaves mixed records to the classifier", () => {
    expect(getExplicitFinanceTypeSignal("Recebi uma fatura de 200 reais")).toBe("expense");
    expect(getExplicitFinanceTypeSignal("Recibí una factura de 40 dólares")).toBe("expense");
    expect(getExplicitFinanceTypeSignal("Recebi 500 e paguei 100 de energia")).toBeNull();
  });

  it("corrects the final finance type returned by the external classifier", () => {
    const result = withExplicitFinanceType(
      "Comprei livros no valor de 108 reais pela conta da empresa",
      {
        intent: "finance_register",
        confidence: 0.9,
        finance: {
          type: "income",
          amount: 108,
          category: "Educação",
          description: "Livros",
          date: "2026-09-06",
          mode: "business",
        },
      },
    );

    expect(result.finance?.type).toBe("expense");
  });
});

describe("explicit finance destination mode", () => {
  it.each([
    ["Mudar para a conta da empresa", "business"],
    ["Mudar as contas de água para o empresarial", "business"],
    ["Passe da conta da empresa para a conta pessoal", "personal"],
    ["Pasa estos gastos a la cuenta de la empresa", "business"],
    ["Cámbialos a la cuenta personal", "personal"],
  ] as const)("keeps the destination from %s", (message, expected) => {
    const result = withExplicitFinanceDestinationMode(message, {
      intent: "finance_edit",
      confidence: 0.9,
      finance: {
        type: "expense", amount: 10, category: "Outros", description: "Água", date: "2026-09-07",
        mode: expected === "business" ? "personal" : "business",
      },
    });
    expect(result.finance?.newMode).toBe(expected);
  });
});

describe("getExplicitUnscheduledReminderResult", () => {
  const request = "Me lembra depois de comprar o suporte de escova de dente, a luminária para pôr no portão, para ver o interfone que tá assim, e marcar de fazer a limpeza do, do sistema de freio do carro da Deborah.";

  it("preserves a multi-action reminder and leaves only its schedule missing", () => {
    const result = getExplicitUnscheduledReminderResult(request);

    expect(result).toMatchObject({ intent: "reminder_set", confidence: 1 });
    expect(result?.reminder?.scheduledAt).toBeUndefined();
    expect(result?.reminder?.message).toContain("• Comprar o suporte de escova de dente");
    expect(result?.reminder?.message).toContain("• Comprar a luminária para pôr no portão");
    expect(result?.reminder?.message).toContain("• Ver o interfone que tá assim");
    expect(result?.reminder?.message).toContain("• Marcar de fazer a limpeza do sistema de freio do carro da Deborah");
  });

  it("recovers the original reminder after a short clarification", () => {
    const result = getExplicitUnscheduledReminderResult(
      "Ah, preciso de um lembrete de tarefas, por favor.",
      [
        { role: "user", content: request },
        { role: "assistant", content: "Não entendi exatamente." },
      ],
    );

    expect(result?.intent).toBe("reminder_set");
    expect(result?.reminder?.message).toContain("carro da Deborah");
  });

  it("supports Spanish and does not intercept a reminder that already has a schedule", () => {
    expect(getExplicitUnscheduledReminderResult("Recuérdame comprar pan"))
      .toMatchObject({ intent: "reminder_set", reminder: { message: "comprar pan" } });
    expect(getExplicitUnscheduledReminderResult("Recuérdame comprar pan, llamar a María y pagar la luz")?.reminder?.message)
      .toBe("Tareas:\n• Comprar pan\n• Llamar a María\n• Pagar la luz");
    expect(getExplicitUnscheduledReminderResult("Me lembra amanhã às 9 de ligar para João")).toBeNull();
  });
});

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

describe("task lists and scheduled reminders", () => {
  it("turns a spoken list into separate tasks without asking for the title again", () => {
    const result = getExplicitTaskListCreateResult(
      "Monta para mim uma lista de tarefas. Estudar CFC, item 2, cursos que tá na, na Zap Kiko Fotos. Separar as coisas de fotografia, arrumar minha mesa, montar esquema de carregador, e concursos de fotografia que tá no WhatsApp. Prepara uma lista de tarefas para mim sobre esses eventos, por favor.",
    );

    expect(result?.intent).toBe("task_create");
    expect(result?.tasks?.map(task => task.title)).toEqual([
      "Estudar CFC",
      "cursos que tá na Zap Kiko Fotos",
      "Separar as coisas de fotografia",
      "arrumar minha mesa",
      "montar esquema de carregador",
      "concursos de fotografia que tá no WhatsApp",
    ]);
  });

  it("treats a task with an explicit notification time as a reminder", () => {
    const result = getExplicitScheduledReminderResult(
      "Nilmar, tarefa de hoje. 2 horas da tarde, confirmar se eu depositei a pensão da Rafa.",
    );

    expect(result).toMatchObject({
      intent: "reminder_set",
      reminder: {
        message: "confirmar se eu depositei a pensão da Rafa",
        repeat: "none",
      },
    });
    expect(result?.reminder?.scheduledAt).toMatch(/^\d{4}-\d{2}-\d{2}T14:00:00$/);
  });

  it("supports the same reminder wording in Spanish", () => {
    expect(getExplicitScheduledReminderResult("Tarea de mañana, 3 de la tarde, confirmar el pago"))
      .toMatchObject({ intent: "reminder_set", reminder: { message: "confirmar el pago" } });
  });

  it("creates a Spanish task list item by item", () => {
    expect(getExplicitTaskListCreateResult("Crea una lista de tareas: estudiar, ordenar el escritorio y llamar a Ana")?.tasks?.map(task => task.title))
      .toEqual(["estudiar", "ordenar el escritorio", "llamar a Ana"]);
  });

  it("applies the reminder correction before calling the external classifier", async () => {
    const result = await processMessage("Tarefa de hoje, 2 horas da tarde, confirmar o depósito");
    expect(result).toMatchObject({ intent: "reminder_set", confidence: 1, reminder: { message: "confirmar o depósito" } });
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

describe("finance detail conversation context", () => {
  const expenseHistory = [
    { role: "user" as const, content: "Despesas em empresarial" },
    { role: "assistant" as const, content: "📋 Nenhuma despesa registrada ou programada em *setembro de 2026* (Empresa)." },
    { role: "user" as const, content: "E pessoal" },
    { role: "assistant" as const, content: "📋 Nenhuma despesa registrada ou programada em *setembro de 2026* (Pessoal)." },
  ];

  it("keeps the mode and searches for rent in a short follow-up", () => {
    expect(getExplicitFinanceDetailResult("E meu aluguel", expenseHistory)).toMatchObject({
      intent: "finance_detail",
      financeType: "expense",
      mode: "personal",
      keyword: "aluguel",
      confidence: 1,
    });
  });

  it("switches between business and personal without losing the statement type", () => {
    const history = expenseHistory.slice(0, 2);
    expect(getExplicitFinanceDetailResult("E pessoal", history)).toMatchObject({
      intent: "finance_detail", financeType: "expense", mode: "personal",
    });
  });

  it("understands direct detailed statements and their subject", () => {
    expect(getExplicitFinanceDetailResult("Extrato de receitas Auto Socorro")).toMatchObject({
      intent: "finance_detail", financeType: "income", keyword: "Auto Socorro",
    });
    expect(getExplicitFinanceDetailResult("Extracto de gastos de la empresa")).toEqual({
      intent: "finance_detail", financeType: "expense", mode: "business",
      confidence: 1,
    });
    expect(getExplicitFinanceDetailResult("Extrato de despesas do aluguel")).toMatchObject({ keyword: "aluguel" });
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

describe("getExplicitLastGroceryPurchaseResult", () => {
  it("distinguishes the total from the itemized last purchase", () => {
    expect(getExplicitLastGroceryPurchaseResult("quanto gastei na minha última compra do Muffatto?"))
      .toMatchObject({ intent: "grocery_last_purchase_query", grocery: { storeName: "Muffatto", queryDetail: "total" } });
    expect(getExplicitLastGroceryPurchaseResult("o que eu comprei no Muffato última vez?"))
      .toMatchObject({ intent: "grocery_last_purchase_query", grocery: { storeName: "Muffato", queryDetail: "items" } });
    expect(getExplicitLastGroceryPurchaseResult("¿qué compré en Muffato la última vez?"))
      .toMatchObject({ intent: "grocery_last_purchase_query", grocery: { storeName: "Muffato", queryDetail: "items" } });
    expect(getExplicitLastGroceryPurchaseResult("quanto gastei na minha última compra?"))
      .toMatchObject({ intent: "grocery_last_purchase_query", grocery: { queryDetail: "total" } });
  });
});

describe("getExplicitGroceryHistoryQueryResult", () => {
  const anchor = new Date(2026, 8, 6, 12, 0, 0);

  it("combines store, calendar period and itemized history", () => {
    expect(getExplicitGroceryHistoryQueryResult("mostre todas as compras do Muffato em agosto de 2026", anchor))
      .toMatchObject({
        intent: "grocery_history_query",
        grocery: {
          storeName: "muffato",
          period: { from: "2026-08-01", to: "2026-08-31" },
          queryDetail: "items",
        },
      });
    expect(getExplicitGroceryHistoryQueryResult("liste as compras no Assaí de 01/08/2026 a 15/08/2026", anchor))
      .toMatchObject({ grocery: { storeName: "assai", period: { from: "2026-08-01", to: "2026-08-15" } } });
    expect(getExplicitGroceryHistoryQueryResult("mostre as compras do Muffato em 2025", anchor))
      .toMatchObject({ grocery: { storeName: "muffato", period: { from: "2025-01-01", to: "2025-12-31" } } });
  });

  it("supports all history, latest N and ordinal purchases", () => {
    expect(getExplicitGroceryHistoryQueryResult("mostre todas as minhas compras", anchor))
      .toMatchObject({ grocery: { allHistory: true, queryDetail: "items" } });
    expect(getExplicitGroceryHistoryQueryResult("liste minhas últimas 3 compras no Assaí", anchor))
      .toMatchObject({ grocery: { storeName: "assai", allHistory: true, purchaseLimit: 3 } });
    expect(getExplicitGroceryHistoryQueryResult("o que comprei na penúltima compra do Muffato?", anchor))
      .toMatchObject({ grocery: { storeName: "muffato", allHistory: true, purchaseLimit: 1, purchaseOffset: 1 } });
  });

  it("understands the same filters in Spanish", () => {
    expect(getExplicitGroceryHistoryQueryResult("muéstrame mi penúltima compra en Muffato", anchor))
      .toMatchObject({ grocery: { storeName: "muffato", allHistory: true, purchaseLimit: 1, purchaseOffset: 1, queryDetail: "items" } });
  });

  it("does not confuse completed expenses with grocery history queries", () => {
    expect(getExplicitGroceryHistoryQueryResult(
      "Comprei livros no valor de 108 reais pela conta da empresa",
      anchor,
    )).toBeNull();
    expect(getExplicitGroceryHistoryQueryResult(
      "Compré libros por 108 dólares para la empresa",
      anchor,
    )).toBeNull();
    expect(getExplicitGroceryHistoryQueryResult(
      "Comprei os livros que precisava por 108 reais",
      anchor,
    )).toBeNull();
    expect(getExplicitGroceryHistoryQueryResult("Paguei 65 reais na farmácia", anchor)).toBeNull();
    expect(getExplicitGroceryHistoryQueryResult("Recebi 900 reais de comissão", anchor)).toBeNull();
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
