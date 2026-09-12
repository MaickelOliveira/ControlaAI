import { describe, expect, it } from "vitest";
import { matchDueRecurringTransactions, type RecurringTransaction } from "./recurring";

function recurring(overrides: Partial<RecurringTransaction> = {}): RecurringTransaction {
  return {
    id: "rec-1",
    userId: "user-1",
    type: "expense",
    amount: 1500,
    category: "Moradia",
    description: "Aluguel",
    mode: "personal",
    recurrenceType: "recurring",
    paidInstallments: 2,
    repeatUnit: "monthly",
    startDate: "2026-07-11",
    nextDueDate: "2026-09-11",
    status: "active",
    source: "whatsapp",
    createdAt: "2026-07-01T12:00:00.000Z",
    ...overrides,
  };
}

describe("due recurring reconciliation", () => {
  it("locates the rent mentioned as an already paid bill", () => {
    expect(matchDueRecurringTransactions([recurring()], {
      keyword: "a conta de aluguel dela",
      type: "expense",
      mode: "personal",
      today: "2026-09-11",
    })).toHaveLength(1);
  });

  it("never reconciles a future, cancelled, wrong-mode or wrong-value occurrence", () => {
    const candidates = [
      recurring({ id: "future", nextDueDate: "2026-10-11" }),
      recurring({ id: "cancelled", status: "cancelled" }),
      recurring({ id: "business", mode: "business" }),
      recurring({ id: "different-value", amount: 1400 }),
    ];
    expect(matchDueRecurringTransactions(candidates, {
      keyword: "aluguel",
      type: "expense",
      mode: "personal",
      amount: 1500,
      today: "2026-09-11",
    })).toEqual([]);
  });

  it("keeps equally good matches ambiguous so the user can choose", () => {
    const matches = matchDueRecurringTransactions([
      recurring({ id: "home", description: "Aluguel casa" }),
      recurring({ id: "store", description: "Aluguel loja", mode: "business" }),
    ], {
      keyword: "aluguel",
      type: "expense",
      today: "2026-09-11",
    });
    expect(matches.map(item => item.id)).toEqual(["home", "store"]);
  });

  it("prefers an exact description over a broader partial match", () => {
    const matches = matchDueRecurringTransactions([
      recurring({ id: "exact", description: "Aluguel casa" }),
      recurring({ id: "partial", description: "Aluguel" }),
    ], {
      keyword: "aluguel casa",
      type: "expense",
      today: "2026-09-11",
    });
    expect(matches.map(item => item.id)).toEqual(["exact"]);
  });
});
