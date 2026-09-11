import { describe, expect, it } from "vitest";
import {
  getExplicitDailySummaryResult,
  getExplicitFinanceDetailResult,
  getExplicitFinanceConfirmPendingResult,
  getExplicitPendingFinanceRegisterResult,
  getExplicitFinanceTypeSignal,
  getExplicitEmployeeCrudResult,
  getExplicitCustomerCrudResult,
  getExplicitDriveRenameResult,
  getExplicitDriveSearchResult,
  getExplicitModeSwitchResult,
  getExplicitGroceryListAddResult,
  getExplicitGroceryListManagementResult,
  getExplicitGroceryHistoryQueryResult,
  getExplicitGrocerySpendQueryResult,
  getExplicitLastGroceryPurchaseResult,
  getExplicitRecurringQueryResult,
  getExplicitRelativePeriod,
  getExplicitTaskCreateResult,
  getExplicitTaskListCreateResult,
  getExplicitScheduledReminderResult,
  getExplicitUpcomingFinanceQueryResult,
  getExplicitAccountCommandResult,
  getExplicitLastFinanceAccountEditResult,
  getExplicitLastFinanceEmployeeEditResult,
  getFinanceAccountDestinationHint,
  getExplicitUnscheduledReminderResult,
  getExplicitVehicleCrudResult,
  getExplicitWebSearchResult,
  getWebSearchMissingQuestion,
  getExplicitWeeklySummaryResult,
  getUnsupportedBankConnectionResponse,
  normalizeMeetingCreation,
  processMessage,
  withExplicitFinanceDestinationMode,
  withExplicitFinanceAccount,
  withExplicitFinanceType,
} from "./ai-processor";

describe("pending finance confirmation parity", () => {
  it("recognizes early payment and collection in Portuguese and Spanish", async () => {
    expect(getExplicitFinanceConfirmPendingResult("Já paguei a conta de luz que estava pendente"))
      .toMatchObject({ intent: "finance_confirm_pending", financeType: "expense", keyword: "conta de luz" });
    expect(await processMessage("Ya pagué la factura de electricidad que estaba pendiente"))
      .toMatchObject({ intent: "finance_confirm_pending", financeType: "expense", keyword: "factura de electricidad" });
    expect(getExplicitFinanceConfirmPendingResult("Ya recibí el alquiler que estaba programado"))
      .toMatchObject({ intent: "finance_confirm_pending", financeType: "income", keyword: "alquiler" });
  });

  it("does not hijack an ordinary expense that was already paid", () => {
    expect(getExplicitFinanceConfirmPendingResult("Ya pagué la luz hoy")).toBeNull();
  });
});

describe("natural pending finance registration", () => {
  const anchor = new Date(2026, 8, 10, 12, 0, 0);

  it("understands the exact real-world wording without treating Tempo as weather", async () => {
    const message = "Colocar em contas a receber empresarial Cliente Uss(Tempo) valor R$461,80 receber no dia 24/10";
    expect(getExplicitPendingFinanceRegisterResult(message, anchor)).toMatchObject({
      intent: "finance_register",
      mode: "business",
      finance: {
        type: "income",
        amount: 461.8,
        category: "Vendas",
        description: "Cliente Uss(Tempo)",
        date: "2026-10-24",
        mode: "business",
        pending: true,
      },
    });
    expect(getExplicitWebSearchResult(message)).toBeNull();
    expect(await processMessage(message)).toMatchObject({ intent: "finance_register", finance: { amount: 461.8, pending: true } });
  });

  it.each([
    ["Lança R$ 461,80 do cliente USS para receber dia 24/10 na empresa", "income", 461.8, "business"],
    ["Tenho 461,80 reais pra receber do cliente USS em 24/10", "income", 461.8, undefined],
    ["Cliente USS me deve R$461,80 e paga dia 24/10", "income", 461.8, undefined],
    ["Adiciona nas contas a pagar da empresa fornecedor ABC valor R$900 dia 30/09", "expense", 900, "business"],
    ["Tenho 250 reais para pagar de internet dia 15/10", "expense", 250, undefined],
    ["Coloque cliente Ana 850 pra receber em 15/10 na empresa", "income", 850, "business"],
    ["Anota pra eu receber 90 do João amanhã", "income", 90, undefined],
    ["Bota 1200 pra pagar fornecedor XPTO dia 25 na empresa", "expense", 1200, "business"],
    ["Cliente Marcos vai me pagar 560 dia 28/09", "income", 560, undefined],
    ["Preciso pagar 95 de telefone no dia 18/09", "expense", 95, undefined],
    ["Agrega en cuentas por cobrar de la empresa Cliente Sol monto $320 el 24/10", "income", 320, "business"],
    ["Tengo 180 dólares por cobrar del cliente Juan el 20/10", "income", 180, undefined],
    ["Pon en cuentas por pagar proveedor ACME importe $700 el 30/09", "expense", 700, undefined],
    ["Cliente Juan me debe $430 y va a pagar el 29/09", "income", 430, undefined],
    ["Necesito pagar $210 de internet el 22/09", "expense", 210, undefined],
  ])("classifies natural variation: %s", (message, type, amount, mode) => {
    expect(getExplicitPendingFinanceRegisterResult(message, anchor)).toMatchObject({
      intent: "finance_register",
      finance: { type, amount, pending: true, ...(mode ? { mode } : {}) },
    });
    expect(getExplicitWebSearchResult(message)).toBeNull();
  });

  it("does not turn pending queries into new records", () => {
    expect(getExplicitPendingFinanceRegisterResult("Quanto tenho a receber esta semana?", anchor)).toBeNull();
    expect(getExplicitPendingFinanceRegisterResult("Quais contas tenho a pagar?", anchor)).toBeNull();
  });

  it("keeps a receivable without a date pending instead of inventing today", () => {
    expect(getExplicitPendingFinanceRegisterResult("Tenho R$ 500 para receber do João", anchor))
      .toMatchObject({ intent: "finance_register", finance: { amount: 500, pending: true, date: "" } });
  });
});

describe("employee command parity", () => {
  it("handles employee CRUD in Portuguese and Spanish without depending on the model", async () => {
    expect(getExplicitEmployeeCrudResult("Registra al empleado Carlos con salario de 1500"))
      .toMatchObject({ intent: "employee_create", employee: { name: "Carlos", salary: 1500 } });
    expect(await processMessage("Añade a María como vendedora"))
      .toMatchObject({ intent: "employee_create", employee: { name: "María", role: "vendedora" } });
    expect(await processMessage("Cambia el salario de Carlos a 1700"))
      .toMatchObject({ intent: "employee_update", keyword: "Carlos", employee: { salary: 1700 } });
    expect(getExplicitEmployeeCrudResult("Desativa o funcionário Carlos"))
      .toMatchObject({ intent: "employee_deactivate", keyword: "Carlos" });
    expect(getExplicitEmployeeCrudResult("Muéstrame mis empleados"))
      .toMatchObject({ intent: "employee_list" });
  });

  it("does not steal customer or Drive updates", () => {
    expect(getExplicitEmployeeCrudResult("Cambia el teléfono del cliente Juan")).toBeNull();
    expect(getExplicitEmployeeCrudResult("Actualiza el correo de la empresa Sol")).toBeNull();
    expect(getExplicitEmployeeCrudResult("Cambia el nombre de la factura a internet septiembre")).toBeNull();
    expect(getExplicitEmployeeCrudResult("Cambia el nombre del archivo del cliente Juan")).toBeNull();
  });
});

describe("customer command parity", () => {
  it("handles customer CRUD in Portuguese and Spanish without the model", () => {
    expect(getExplicitCustomerCrudResult("Registra al cliente Juan con teléfono 56912345678"))
      .toMatchObject({ intent: "customer_create", customer: { name: "Juan", phone: "56912345678" } });
    expect(getExplicitCustomerCrudResult("Muéstrame mis clientes")).toMatchObject({ intent: "customer_list" });
    expect(getExplicitCustomerCrudResult("Busca al cliente Juan"))
      .toMatchObject({ intent: "customer_query", keyword: "Juan" });
    expect(getExplicitCustomerCrudResult("Cambia el teléfono del cliente Juan"))
      .toMatchObject({ intent: "customer_update", keyword: "Juan" });
    expect(getExplicitCustomerCrudResult("Desactiva al cliente Juan"))
      .toMatchObject({ intent: "customer_deactivate", keyword: "Juan" });
  });
});

describe("Drive command parity", () => {
  it("handles Spanish search and rename phrases without the model", () => {
    expect(getExplicitDriveSearchResult("Encuentra la factura de internet"))
      .toMatchObject({ intent: "drive_search" });
    expect(getExplicitDriveSearchResult("Muéstrame el último comprobante guardado"))
      .toMatchObject({ intent: "drive_search" });
    expect(getExplicitDriveRenameResult("Renombra el último archivo como contrato firmado"))
      .toMatchObject({ intent: "drive_rename" });
    expect(getExplicitDriveRenameResult("Pon al comprobante el nombre pago alquiler"))
      .toMatchObject({ intent: "drive_rename" });
  });
});

describe("mode switch parity", () => {
  it("switches personal and business modes deterministically", () => {
    expect(getExplicitModeSwitchResult("Pasa a la cuenta empresarial"))
      .toMatchObject({ intent: "mode_switch", mode: "business" });
    expect(getExplicitModeSwitchResult("Cambia al modo personal"))
      .toMatchObject({ intent: "mode_switch", mode: "personal" });
    expect(getExplicitModeSwitchResult("Troque para o modo empresa"))
      .toMatchObject({ intent: "mode_switch", mode: "business" });
  });

  it("keeps account changes inside an active finance edit", () => {
    expect(getExplicitModeSwitchResult("Mudar para conta da empresa", [
      { role: "assistant", content: "Encontrei: Cinema. O que deseja alterar?" },
    ])).toBeNull();
  });
});

describe("meeting creation parity", () => {
  it("offers the Google Meet flow for new meetings in Portuguese and Spanish", () => {
    const base = {
      intent: "agenda_create" as const,
      confidence: 0.95,
      agendaData: { title: "Reunión con Ana", startDate: "2026-09-09", startTime: "15:00" },
    };
    expect(normalizeMeetingCreation("Agenda una reunión con Ana mañana", base)).toMatchObject({
      intent: "meet_create",
      meetData: { title: "Reunión con Ana", startDate: "2026-09-09", startTime: "15:00" },
    });
    expect(normalizeMeetingCreation("Agende uma reunião com Ana amanhã", base)).toMatchObject({ intent: "meet_create" });
  });

  it("keeps ordinary appointments in the agenda flow", () => {
    const result = { intent: "agenda_create" as const, confidence: 1, agendaData: { title: "Consulta médica" } };
    expect(normalizeMeetingCreation("Crea una cita médica", result).intent).toBe("agenda_create");
  });
});

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
    expect(getExplicitWebSearchResult("vai chver essa semana em salvador"))
      .toMatchObject({ intent: "web_search", confidence: 1, keyword: "vai chver essa semana em salvador" });
    expect(getExplicitWebSearchResult("vai chover esta semana em Manaus?"))
      .toMatchObject({ intent: "web_search", confidence: 1 });
    expect(getExplicitWebSearchResult("¿va a llover esta semana en Santiago?"))
      .toMatchObject({ intent: "web_search", confidence: 1 });
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

  it("uses the previous grounded search to resolve any city or subject referenced indirectly", async () => {
    const history = [
      { role: "user" as const, content: "preço das passagens de Campo Mourão a Balneário Camboriú" },
      { role: "assistant" as const, content: "Encontrei opções de passagens.\n\n🔎 *Fontes consultadas:*\n1. Empresa de ônibus: https://example.com" },
    ];
    expect(getExplicitWebSearchResult("como está o clima lá?", history)).toMatchObject({
      intent: "web_search",
      confidence: 1,
      keyword: expect.stringContaining("Balneário Camboriú"),
    });
    expect(await processMessage("e amanhã?", { user: { activeMode: "personal", customCategoriesExpense: [], customCategoriesIncome: [], locale: "pt-BR" }, history }))
      .toMatchObject({ intent: "web_search", keyword: expect.stringContaining("Campo Mourão") });
  });

  it("resolves the same contextual research flow in Spanish", () => {
    const history = [
      { role: "user" as const, content: "hoteles en Cartagena" },
      { role: "assistant" as const, content: "Encontré opciones.\n\n🔎 *Fuentes consultadas:*\n1. Hotel: https://example.com" },
    ];
    expect(getExplicitWebSearchResult("¿cómo está el clima allí?", history))
      .toMatchObject({ intent: "web_search", keyword: expect.stringContaining("Cartagena") });
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

  it("leaves task updates to the full classifier and resolves Spanish weekday obligations", () => {
    expect(getExplicitTaskCreateResult("Tarefa 2 concluída")).toBeNull();
    expect(getExplicitTaskCreateResult("Tengo que revisar el contrato el viernes")).toMatchObject({
      intent: "task_create",
      task: { title: "revisar el contrato" },
    });
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

  it("schedules a common reminder exactly one hour before the stated time", () => {
    const result = getExplicitScheduledReminderResult(
      "Me lembre de tomar remédio amanhã às 9, me lembra uma hora antes",
    );
    expect(result).toMatchObject({
      intent: "reminder_set",
      reminder: { message: "tomar remédio", repeat: "none" },
    });
    expect(result?.reminder?.scheduledAt).toMatch(/^\d{4}-\d{2}-\d{2}T08:00:00$/);
  });

  it("applies a fifteen-minute advance to a Spanish reminder", () => {
    const result = getExplicitScheduledReminderResult(
      "Recuérdame tomar el medicamento mañana a las 9, avísame 15 minutos antes",
    );
    expect(result).toMatchObject({
      intent: "reminder_set",
      reminder: { message: "tomar el medicamento", repeat: "none" },
    });
    expect(result?.reminder?.scheduledAt).toMatch(/^\d{4}-\d{2}-\d{2}T08:45:00$/);
  });

  it("keeps the stated time when no advance was requested", () => {
    const result = getExplicitScheduledReminderResult(
      "Me lembre amanhã de tomar remédio às 18",
    );
    expect(result).toMatchObject({
      intent: "reminder_set",
      reminder: { message: "tomar remédio", repeat: "none" },
    });
    expect(result?.reminder?.scheduledAt).toMatch(/^\d{4}-\d{2}-\d{2}T18:00:00$/);
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

describe("Spanish deterministic queries", () => {
  it("separates supermarket totals from purchase item history", () => {
    expect(getExplicitGrocerySpendQueryResult("¿Cuánto gasté en mis compras de supermercado este mes?"))
      .toMatchObject({ intent: "grocery_spend_query", grocery: { queryDetail: "total" } });
  });

  it("keeps subscription lookups inside Zelo instead of sending them to web search", () => {
    expect(getExplicitRecurringQueryResult("Consulta la suscripción de internet"))
      .toMatchObject({ intent: "recurring_query", keyword: "internet" });
  });
});

describe("getUnsupportedBankConnectionResponse", () => {
  it("blocks invented bank connection instructions and points to in-app support", () => {
    const response = getUnsupportedBankConnectionResponse(
      "Não encontrei o local para conectar contas bancárias.",
    );

    expect(response).toContain("criar e usar contas manuais");
    expect(response).toContain("não é possível conectá-las ou sincronizá-las");
    expect(response).toContain("não utiliza Open Finance nem Open Banking");
    expect(response).toContain("*Suporte* no canto inferior direito");
    expect(response).not.toContain("Configurações");
    expect(response).not.toContain("Integrações Bancárias");
  });

  it("blocks direct Open Finance questions", () => {
    expect(getUnsupportedBankConnectionResponse("Como ativo o Open Finance?"))
      .toContain("*Suporte* no canto inferior direito");
    expect(getUnsupportedBankConnectionResponse("Como adicionar contas?"))
      .toBeNull();
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

    expect(response).toContain("não é possível conectá-las ou sincronizá-las");
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

describe("manual account commands", () => {
  it.each([
    ["Cadastre uma conta Nubank", { intent: "account_create", account: { name: "Nubank" } }],
    ["Crea una cuenta Caja", { intent: "account_create", account: { name: "Caja" } }],
    ["Liste minhas contas", { intent: "account_list" }],
    ["Muestra mis cuentas", { intent: "account_list" }],
    ["Renomeie a conta Nubank para Viagens", { intent: "account_update", account: { name: "Nubank", newName: "Viagens" } }],
    ["Cambia la cuenta Caja a Efectivo", { intent: "account_update", account: { name: "Caja", newName: "Efectivo" } }],
    ["Exclua a conta Viagens", { intent: "account_delete", account: { name: "Viagens" } }],
    ["Elimina la cuenta Viajes", { intent: "account_delete", account: { name: "Viajes" } }],
    ["Defina a conta Nubank como padrão", { intent: "account_set_default", account: { name: "Nubank" } }],
    ["Establece la cuenta Caja como predeterminada", { intent: "account_set_default", account: { name: "Caja" } }],
  ])("classifies %s", (message, expected) => {
    expect(getExplicitAccountCommandResult(message)).toMatchObject(expected);
  });

  it("filters queries by account, merchant and relative period", () => {
    expect(getExplicitAccountCommandResult("quanto gastei na conta Nubank semana passada"))
      .toMatchObject({ intent: "finance_query", account: { name: "Nubank" }, financeType: "expense", period: { from: "2026-08-31", to: "2026-09-06" } });
    expect(getExplicitAccountCommandResult("quanto gastei de ifood nessa conta"))
      .toMatchObject({ intent: "finance_query", account: { useContext: true }, keyword: "ifood" });
    expect(getExplicitAccountCommandResult("quanto gastou de ifoode nessa conta"))
      .toMatchObject({ intent: "finance_query", account: { useContext: true }, keyword: "ifoode" });
    expect(getExplicitAccountCommandResult("quanto gastou semana passada nessa conta"))
      .toMatchObject({ intent: "finance_query", account: { useContext: true }, period: { from: "2026-08-31", to: "2026-09-06" } });
    expect(getExplicitAccountCommandResult("cuánto gasté con Rappi en esa cuenta"))
      .toMatchObject({ intent: "finance_query", account: { useContext: true }, keyword: "Rappi" });
    expect(getExplicitAccountCommandResult("quanto gastei na conta Nubank com ifood semana passada"))
      .toMatchObject({ intent: "finance_query", account: { name: "Nubank" }, keyword: "ifood", period: { from: "2026-08-31", to: "2026-09-06" } });
    expect(getExplicitAccountCommandResult("extrato da conta Nubank"))
      .toMatchObject({ intent: "finance_detail", account: { name: "Nubank" } });
  });

  it.each([
    "quanto gastei nessa conta hoje",
    "quanto saiu dessa conta ontem",
    "saldo desta conta",
    "extrato dessa conta",
    "movimentos nesta conta",
    "cuánto gasté en esa cuenta hoy",
    "saldo de esta cuenta",
    "extracto de esa cuenta",
    "movimientos en esta cuenta",
  ])("recognizes contextual account query: %s", message => {
    expect(getExplicitAccountCommandResult(message)).toMatchObject({ account: { useContext: true } });
  });

  it("attaches named or contextual accounts to finance registrations", () => {
    const base = { intent: "finance_register" as const, confidence: 1, finance: { type: "expense" as const, amount: 60, category: "Saúde", description: "Farmácia", date: "2026-09-10" } };
    expect(withExplicitFinanceAccount("Gastei 60 na farmácia pela conta Nubank", base))
      .toMatchObject({ finance: { accountHint: "Nubank" }, account: { name: "Nubank" } });
    expect(withExplicitFinanceAccount("Gasté 60 en farmacia en esa cuenta", base))
      .toMatchObject({ account: { useContext: true } });
  });

  it.each([
    ["altere esse último para Inter", "Inter", "last"],
    ["mude o último lançamento para a conta Nubank", "Nubank", "last"],
    ["passe esse gasto para Inter", "Inter", "last"],
    ["cambia el último movimiento a la cuenta Caja", "Caja", "last"],
  ] as const)("edits the account of the latest finance directly: %s", (message, account, reference) => {
    expect(getFinanceAccountDestinationHint(message)).toBe(account);
    expect(getExplicitLastFinanceAccountEditResult(message)).toMatchObject({
      intent: "finance_edit",
      finance: { accountHint: account },
      account: { name: account },
      lastFinanceReference: reference,
    });
  });

  it.each([
    ["conta Inter", "Inter"],
    ["altere a conta Dinheiro para Inter", "Inter"],
    ["cambia la cuenta Efectivo a Caja", "Caja"],
  ])("extracts the target account from a pending finance edit: %s", (message, account) => {
    expect(getFinanceAccountDestinationHint(message)).toBe(account);
  });

  it("does not mistake ordinary edit values or mode changes for manual accounts", () => {
    expect(getFinanceAccountDestinationHint("muda para 80 reais")).toBeNull();
    expect(getFinanceAccountDestinationHint("muda esse último para a conta da empresa")).toBeNull();
  });

  it("routes the latest-finance account change before generic account commands or the model", async () => {
    await expect(processMessage("altere esse ultimo para inter")).resolves.toMatchObject({
      intent: "finance_edit",
      finance: { accountHint: "inter" },
      lastFinanceReference: "last",
      confidence: 1,
    });
  });

  it("keeps business mode separate from a manual account name", () => {
    expect(getExplicitAccountCommandResult("quanto gastei na conta da empresa")).toBeNull();
    expect(getExplicitAccountCommandResult("registrar conta de luz de 120 reais")).toBeNull();
    expect(getExplicitAccountCommandResult("apague a conta de internet")).toBeNull();
    expect(getExplicitAccountCommandResult("quais contas tenho a pagar?")).toBeNull();
  });
});

describe("latest finance employee corrections", () => {
  it.each([
    ["não é funcionário Rafael e sim a Luana", "Luana"],
    ["não foi Rafael, foi Luana", "Luana"],
    ["troque o funcionário do último lançamento para Luana", "Luana"],
    ["no es el empleado Rafael sino Luana", "Luana"],
    ["cambia el empleado del último movimiento a Luana", "Luana"],
  ])("reassigns the latest payment: %s", async (message, name) => {
    expect(getExplicitLastFinanceEmployeeEditResult(message)).toMatchObject({
      intent: "finance_edit",
      finance: { employeeName: name },
      lastFinanceReference: "last",
    });
    await expect(processMessage(message)).resolves.toMatchObject({
      intent: "finance_edit",
      finance: { employeeName: name },
      lastFinanceReference: "last",
    });
  });

  it.each([
    "remova o funcionário desse lançamento",
    "deixe esse último gasto sem funcionário",
    "quita el empleado de ese movimiento",
  ])("removes only the employee association: %s", message => {
    expect(getExplicitLastFinanceEmployeeEditResult(message)).toMatchObject({
      intent: "finance_edit", finance: { clearEmployee: true }, lastFinanceReference: "last",
    });
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
