import { describe, expect, it } from "vitest";
import { parseTaskQueryScope, replyScopedTaskList, selectTasksForQuery } from "./task-query";
import type { Task } from "./tasks";

const now = new Date("2026-10-15T02:00:00Z"); // 14/10, 23h em São Paulo
const task = (id: string, changes: Partial<Task> = {}): Task => ({
  id, userId: "user-1", title: id, status: "pending", priority: "medium",
  mode: "personal", createdAt: "2026-10-15T01:00:00Z", ...changes,
});

describe("consultas de tarefas por data", () => {
  it.each([
    ["Mostre as tarefas criadas hoje", "created_today"],
    ["Quais tarefas eu criei hoje?", "created_today"],
    ["Quais tarefas tenho para hoje?", "due_today"],
    ["Mostre as tarefas que vencem hoje", "due_today"],
    ["Quais tarefas concluí hoje?", "completed_today"],
    ["Mostre minhas tarefas pendentes agora", "pending"],
  ] as const)("entende %s", (message, scope) => {
    expect(parseTaskQueryScope(message)).toBe(scope);
  });

  it("inclui tarefas concluídas criadas hoje, mas não as criadas ontem no fuso brasileiro", () => {
    const tasks = [
      task("concluída hoje", { status: "completed" }),
      task("pendente hoje"),
      task("ontem", { createdAt: "2026-10-14T02:00:00Z" }),
    ];
    expect(selectTasksForQuery(tasks, "created_today", now).map(t => t.id))
      .toEqual(["concluída hoje", "pendente hoje"]);
  });

  it("mostra apenas pendentes com vencimento hoje", () => {
    const tasks = [
      task("vence hoje", { dueDate: "2026-10-14" }),
      task("já concluída", { dueDate: "2026-10-14", status: "completed" }),
      task("vence amanhã", { dueDate: "2026-10-15" }),
    ];
    expect(selectTasksForQuery(tasks, "due_today", now).map(t => t.id)).toEqual(["vence hoje"]);
  });

  it("não afirma que não há pendências quando a pergunta era sobre criação", () => {
    expect(replyScopedTaskList([], "created_today", "personal"))
      .toContain("Não encontrei tarefas criadas hoje");
    expect(replyScopedTaskList([task("feito", { status: "completed" })], "created_today", "personal"))
      .toContain("✅ feito");
  });

  it("não inventa uma data de conclusão que o sistema não registra", () => {
    expect(replyScopedTaskList([], "completed_today", "personal"))
      .toContain("não registro a data em que cada tarefa foi concluída");
  });
});
