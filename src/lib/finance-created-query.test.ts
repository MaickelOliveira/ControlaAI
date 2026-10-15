import { describe, expect, it } from "vitest";
import { createdDayBoundsBR, isFinanceCreatedTodayQuery, replyFinancesCreatedToday } from "./finance-created-query";
import type { Finance } from "./finances";

const finance = (id: string, type: Finance["type"]): Finance => ({
  id, userId: "user-1", type, amount: 1, category: "Outros", description: "TESTE AUDITORIA",
  date: "2026-10-15", mode: "personal", source: "whatsapp", status: "posted",
  createdAt: "2026-10-15T17:42:00Z",
});

describe("lançamentos criados hoje", () => {
  it("reconhece a pergunta neutra, mas preserva consultas explícitas de despesas", () => {
    expect(isFinanceCreatedTodayQuery("Mostre os lançamentos de teste criados hoje.")).toBe(true);
    expect(isFinanceCreatedTodayQuery("Mostre as despesas criadas hoje.")).toBe(false);
  });

  it("usa a virada do dia em São Paulo para a consulta ao banco", () => {
    expect(createdDayBoundsBR("2026-10-15")).toEqual({
      from: "2026-10-15T03:00:00.000Z", to: "2026-10-16T03:00:00.000Z",
    });
  });

  it("mostra a despesa e a receita de mesmo nome sem somá-las como uma única saída", () => {
    const reply = replyFinancesCreatedToday([finance("expense", "expense"), finance("income", "income")], "personal", "TESTE AUDITORIA");
    expect(reply).toContain("Despesas (1)");
    expect(reply).toContain("Receitas (1)");
    expect(reply.match(/TESTE AUDITORIA/g)).toHaveLength(2);
    expect(reply).not.toContain("Você gastou");
  });

  it("não afirma que não existe despesa quando só há receita", () => {
    const reply = replyFinancesCreatedToday([finance("income", "income")], "personal");
    expect(reply).toContain("Receitas (1)");
    expect(reply).not.toContain("Nenhuma despesa");
  });
});
