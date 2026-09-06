import { describe, expect, it } from "vitest";
import type { Finance } from "./finances";
import type { RecurringTransaction } from "./recurring";
import { buildBalanceForecast, collectUpcomingFinanceItems, replyUpcomingFinances } from "./upcoming-finances";

function pending(overrides: Partial<Finance> = {}): Finance {
  return {
    id: "pending-1",
    userId: "user-1",
    type: "expense",
    amount: 500,
    category: "Moradia",
    description: "Aluguel",
    date: "2026-09-10",
    mode: "personal",
    source: "whatsapp",
    status: "pending",
    autoPost: true,
    createdAt: "2026-09-01T12:00:00.000Z",
    ...overrides,
  };
}

function recurring(overrides: Partial<RecurringTransaction> = {}): RecurringTransaction {
  return {
    id: "recurring-1",
    userId: "user-1",
    type: "income",
    amount: 300,
    category: "Vendas",
    description: "Recebimento do cliente",
    mode: "personal",
    recurrenceType: "recurring",
    paidInstallments: 0,
    repeatUnit: "monthly",
    startDate: "2026-08-15",
    nextDueDate: "2026-09-15",
    status: "active",
    source: "whatsapp",
    createdAt: "2026-08-01T12:00:00.000Z",
    ...overrides,
  };
}

describe("upcoming finances", () => {
  it("combines pending and recurring items, deduplicates them and keeps undated items visible", () => {
    const items = collectUpcomingFinanceItems(
      [
        pending(),
        pending({ id: "undated-1", description: "Conserto", amount: 200, autoPost: false }),
      ],
      [
        recurring(),
        recurring({ id: "duplicate-1", type: "expense", description: "Aluguel", amount: 500, nextDueDate: "2026-09-10" }),
        recurring({ id: "outside-1", description: "Fora do período", nextDueDate: "2026-10-15" }),
      ],
      { from: "2026-09-06", to: "2026-09-30", includeUndated: true },
    );

    expect(items).toHaveLength(3);
    expect(items.map(item => item.description)).toEqual(["Aluguel", "Recebimento do cliente", "Conserto"]);
    expect(items.at(-1)).toMatchObject({ origin: "undated", dueDate: undefined });
  });

  it("calculates projected balance without inventing a date for undated items", () => {
    const items = collectUpcomingFinanceItems(
      [pending(), pending({ id: "undated-1", description: "Conserto", amount: 200, autoPost: false })],
      [recurring()],
      { from: "2026-09-06", to: "2026-09-30", includeUndated: true },
    );

    expect(buildBalanceForecast("personal", 1_000, items)).toEqual({
      mode: "personal",
      currentBalance: 1_000,
      upcomingIncome: 300,
      upcomingExpense: 500,
      projectedBalance: 800,
    });
  });

  it("answers naturally with the requested list and an explicit forecast in Portuguese and Spanish", () => {
    const items = collectUpcomingFinanceItems(
      [pending(), pending({ id: "undated-1", description: "Conserto", amount: 200, autoPost: false })],
      [recurring()],
      { from: "2026-09-06", to: "2026-09-30", includeUndated: true },
    );
    const forecast = buildBalanceForecast("personal", 1_000, items);

    const pt = replyUpcomingFinances(items, "expense", [forecast], "setembro de 2026", "2026-09-06", "pt-BR");
    expect(pt).toContain("2 despesas para pagar");
    expect(pt).toContain("Total a pagar");
    expect(pt).toContain("Saldo previsto");
    expect(pt).toContain("pendência sem data");

    const es = replyUpcomingFinances(items, "expense", [forecast], "septiembre de 2026", "2026-09-06", "es");
    expect(es).toContain("2 gastos por pagar");
    expect(es).toContain("Total por pagar");
    expect(es).toContain("Saldo previsto");
    expect(es).toContain("pendiente sin fecha");
  });
});
