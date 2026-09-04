import { describe, expect, it } from "vitest";
import { getExplicitTaskCreateResult, getUnsupportedBankConnectionResponse, processMessage } from "./ai-processor";

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
