import { describe, expect, it } from "vitest";
import { buildActionContinuationMessage, getMissingActionQuestion, mergeActionContinuation } from "./action-completion";

describe("action completion", () => {
  it("asks only for the missing field in Portuguese and Spanish", () => {
    expect(getMissingActionQuestion({ intent: "task_create", confidence: 0.9 }, "pt-BR"))
      .toBe("📌 Qual tarefa deseja criar?");
    expect(getMissingActionQuestion({ intent: "task_create", confidence: 0.9 }, "es"))
      .toBe("📌 ¿Qué tarea quieres crear?");
    expect(getMissingActionQuestion({
      intent: "finance_register", confidence: 0.9,
      finance: { type: "expense", amount: 0, category: "Outros", description: "Almoço", date: "2026-09-06" },
    }, "es")).toBe("💰 ¿Cuál es el importe?");
  });

  it("does not ask again when the action has everything required", () => {
    expect(getMissingActionQuestion({
      intent: "task_create", confidence: 0.9,
      task: { title: "Comprar pão", priority: "medium" },
    }, "pt-BR")).toBeNull();
    expect(getMissingActionQuestion({
      intent: "task_create", confidence: 0.9,
      tasks: [
        { title: "Estudar", priority: "medium" },
        { title: "Arrumar a mesa", priority: "low" },
      ],
    }, "pt-BR")).toBeNull();
    expect(getMissingActionQuestion({
      intent: "category_create", confidence: 0.9, categoryName: "Pets",
    }, "es")).toBeNull();
  });

  it("preserves the original intent and combines fields from short answers", () => {
    const merged = mergeActionContinuation(
      { intent: "meet_create", confidence: 0.7, meetData: { title: "Reunião", startDate: "2026-09-07" } },
      { intent: "unknown", confidence: 0.3, meetData: { startTime: "09:00" } },
    );

    expect(merged).toMatchObject({
      intent: "meet_create", confidence: 0.85,
      meetData: { title: "Reunião", startDate: "2026-09-07", startTime: "09:00" },
    });
    expect(buildActionContinuationMessage("criar reunião", ["amanhã", "às 9"]))
      .toContain("Informação complementar 2: às 9");
  });

  it("preserves batch items while completing an action", () => {
    const previous = {
      intent: "task_create" as const,
      confidence: 0.8,
      tasks: [{ title: "Estudar", priority: "medium" as const }],
    };
    const merged = mergeActionContinuation(previous, { intent: "unknown", confidence: 0.2 });
    expect(merged.tasks).toEqual(previous.tasks);
  });

  it("asks for missing information in Spanish across every actionable service", () => {
    const incomplete = [
      { intent: "finance_register", confidence: 1 },
      { intent: "task_create", confidence: 1 },
      { intent: "task_update", confidence: 1 },
      { intent: "reminder_update", confidence: 1 },
      { intent: "goal_add", confidence: 1 },
      { intent: "vehicle_expense", confidence: 1 },
      { intent: "grocery_list_add", confidence: 1 },
      { intent: "employee_update", confidence: 1 },
      { intent: "customer_update", confidence: 1 },
      { intent: "recurring_edit", confidence: 1 },
      { intent: "finance_confirm_pending", confidence: 1 },
      { intent: "agenda_update", confidence: 1 },
      { intent: "meet_create", confidence: 1 },
      { intent: "drive_rename", confidence: 1 },
      { intent: "category_create", confidence: 1 },
      { intent: "account_create", confidence: 1 },
      { intent: "account_update", confidence: 1 },
      { intent: "account_delete", confidence: 1 },
      { intent: "account_set_default", confidence: 1 },
    ] as const;
    for (const command of incomplete) {
      const question = getMissingActionQuestion(command, "es");
      expect(question, command.intent).toBeTruthy();
      expect(question, command.intent).toMatch(/[¿¡]|Qué|Cuál|Cuánto|Cuál debe/);
      expect(question, command.intent).not.toMatch(/\b(?:Qual|Quanto|deseja|compromisso|lançamento|arquivo)\b/i);
    }
  });
});
