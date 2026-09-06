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
});
