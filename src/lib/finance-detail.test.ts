import { describe, expect, it } from "vitest";
import { replyFinanceDetail } from "./finance-detail";
import type { Finance } from "./finances";
import type { UpcomingFinanceItem } from "./upcoming-finances";

const rent: UpcomingFinanceItem = {
  id: "rent-1",
  type: "expense",
  description: "Aluguel casa",
  amount: 1300,
  dueDate: "2026-09-09",
  mode: "personal",
  origin: "recurring",
};

describe("finance detail reply", () => {
  it("shows a future recurring rent even when the realized statement is empty", () => {
    const reply = replyFinanceDetail([], [rent], {
      type: "expense",
      mode: "personal",
      periodLabel: "setembro de 2026",
      locale: "pt-BR",
      keyword: "aluguel",
    });

    expect(reply).toContain("Nenhuma despesa já paga");
    expect(reply).toContain("Aluguel casa");
    expect(reply).toContain("R$ 1.300,00");
    expect(reply).toContain("recorrente");
    expect(reply).toContain("ainda não fazem parte do saldo realizado");
  });

  it("keeps realized and scheduled totals separate", () => {
    const posted: Finance = {
      id: "expense-1", userId: "user-1", type: "expense", amount: 100,
      category: "Moradia", description: "Condomínio", date: "2026-09-05",
      mode: "personal", source: "whatsapp", status: "posted", createdAt: "2026-09-05T12:00:00Z",
    };
    const reply = replyFinanceDetail([posted], [rent], {
      type: "expense", mode: "personal", periodLabel: "setembro de 2026", locale: "pt-BR",
    });

    expect(reply).toContain("Total pago: R$ 100,00");
    expect(reply).toContain("Total a pagar: R$ 1.300,00");
  });

  it("returns the same clear distinction in Spanish", () => {
    const reply = replyFinanceDetail([], [{ ...rent, description: "Alquiler casa" }], {
      type: "expense", mode: "personal", periodLabel: "septiembre de 2026", locale: "es",
    });

    expect(reply).toContain("No hay ningún gasto ya pagado");
    expect(reply).toContain("Alquiler casa");
    expect(reply).toContain("todavía no forman parte del saldo realizado");
  });
});
