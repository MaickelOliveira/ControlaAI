import { describe, expect, it } from "vitest";
import type { Appointment } from "./agenda";
import type { Task } from "./tasks";
import type { BalanceForecast, UpcomingFinanceItem } from "./upcoming-finances";
import { replyAdvisorSummary } from "./advisor-summary";

const appointment: Appointment = {
  id: "appointment-1",
  userId: "user-1",
  title: "Reunião com cliente",
  startAt: "2026-09-08T17:00:00.000Z",
  allDay: false,
  repeat: "none",
  status: "scheduled",
  source: "whatsapp",
  createdAt: "2026-09-01T12:00:00.000Z",
};

const task: Task = {
  id: "task-1",
  userId: "user-1",
  title: "Enviar proposta",
  status: "pending",
  priority: "high",
  dueDate: "2026-09-09",
  mode: "business",
  createdAt: "2026-09-01T12:00:00.000Z",
};

const finances: UpcomingFinanceItem[] = [
  { id: "expense-1", type: "expense", description: "Aluguel", amount: 1_000, dueDate: "2026-09-10", mode: "business", origin: "recurring" },
  { id: "income-1", type: "income", description: "Cliente Alfa", amount: 2_000, dueDate: "2026-09-11", mode: "business", origin: "scheduled" },
];

const forecast: BalanceForecast = {
  mode: "business",
  currentBalance: 500,
  upcomingIncome: 2_000,
  upcomingExpense: 1_000,
  projectedBalance: 1_500,
};

describe("replyAdvisorSummary", () => {
  it("combines appointments, tasks, payables, receivables and forecast", () => {
    const message = replyAdvisorSummary(
      "weekly", "07/09/2026 a 13/09/2026", [appointment], [task], finances, [forecast], "2026-09-07", "pt-BR",
    );

    expect(message).toContain("Resumo da semana");
    expect(message).toContain("Reunião com cliente");
    expect(message).toContain("Enviar proposta");
    expect(message).toContain("A pagar");
    expect(message).toContain("Aluguel");
    expect(message).toContain("A receber");
    expect(message).toContain("Cliente Alfa");
    expect(message).toContain("Previsão de saldo");
    expect(message).toContain("Saldo previsto");
  });

  it("uses the same complete briefing in Spanish", () => {
    const message = replyAdvisorSummary(
      "daily", "martes, 08/09/2026", [appointment], [task], finances, [forecast], "2026-09-08", "es",
    );

    expect(message).toContain("Resumen del día");
    expect(message).toContain("Agenda");
    expect(message).toContain("Tareas");
    expect(message).toContain("Por pagar");
    expect(message).toContain("Por cobrar");
    expect(message).toContain("Previsión de saldo");
  });
});
