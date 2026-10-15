import { describe, expect, it } from "vitest";
import { filterRemindersForNextWeek, reminderListScope } from "./reminder-query";
import { replyReminderList } from "./bot-replies";
import type { Reminder } from "./reminders";

const reminder = (id: string, scheduledAt: string, repeat: Reminder["repeat"] = "none"): Reminder => ({
  id, userId: "user-1", message: id, phone: "", scheduledAt, repeat,
  mode: "personal", sent: false, failedAttempts: 0, recipientType: "self", createdAt: "2026-10-15T12:00:00Z",
});

describe("lembretes da próxima semana", () => {
  const now = new Date("2026-10-15T17:00:00Z"); // quinta-feira, 15/10 em São Paulo

  it.each(["Mostre os lembretes da próxima semana", "Quais avisos tenho na semana que vem?"])(
    "reconhece %s", message => expect(reminderListScope(message)).toBe("next_week"),
  );

  it("não inclui o lembrete único de amanhã e inclui o de terça da próxima semana", () => {
    const rows = [
      reminder("amanhã", "2026-10-16T13:00:00Z"),
      reminder("terça", "2026-10-20T13:00:00Z"),
      reminder("semana seguinte", "2026-10-26T13:00:00Z"),
    ];
    expect(filterRemindersForNextWeek(rows, now).map(row => row.id)).toEqual(["terça"]);
  });

  it("inclui a ocorrência de um lembrete diário na próxima semana sem alterar o registro", () => {
    const daily = reminder("diário", "2026-10-16T13:00:00Z", "daily");
    const result = filterRemindersForNextWeek([daily], now);
    expect(result).toHaveLength(1);
    expect(result[0].scheduledAt).toBe("2026-10-19T13:00:00.000Z");
    expect(daily.scheduledAt).toBe("2026-10-16T13:00:00Z");
  });

  it("descreve corretamente uma semana sem lembretes", () => {
    expect(replyReminderList([], "pt-BR", "next_week")).toBe("🔔 Nenhum lembrete para a próxima semana.");
  });

  it("não usa índices de edição da lista completa na lista filtrada", () => {
    const text = replyReminderList([reminder("terça", "2026-10-20T13:00:00Z")], "pt-BR", "next_week");
    expect(text).toContain("• 💬 terça");
    expect(text).not.toContain("1. 💬");
  });
});
