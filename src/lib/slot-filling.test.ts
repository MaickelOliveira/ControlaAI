import { describe, expect, it } from "vitest";
import { FLOWS, hasMissingSlotFields, parseReminderDateAnswer, parseReminderTimeAnswer, slotDayOfMonth } from "./slot-filling";

describe("reminder slot filling", () => {
  it("parses relative dates and time in Portuguese", () => {
    expect(parseReminderDateAnswer("amanhã às 9", "2026-09-06"))
      .toEqual({ date: "2026-09-07", time: "09:00" });
    expect(parseReminderDateAnswer("segunda às 8", "2026-09-06"))
      .toEqual({ date: "2026-09-07", time: "08:00" });
    expect(parseReminderTimeAnswer("às 14:30")).toBe("14:30");
  });

  it("parses the same answers in Spanish", () => {
    expect(parseReminderDateAnswer("mañana a las 9", "2026-09-06"))
      .toEqual({ date: "2026-09-07", time: "09:00" });
    expect(parseReminderDateAnswer("martes a las 16:15", "2026-09-06"))
      .toEqual({ date: "2026-09-08", time: "16:15" });
  });

  it("asks only for date and time when reminder content is already known", () => {
    const flow = FLOWS.reminder_set!;
    const ctx = {
      user: { locale: "es" }, userId: "user-1", phone: "5215512345678", mode: "personal" as const,
    } as Parameters<typeof flow.seed>[1];
    const draft = flow.seed({
      intent: "reminder_set", confidence: 1, reminder: { message: "Comprar pan" },
    }, ctx);

    expect(flow.missing(draft, ctx)).toEqual(["startDate", "startTime"]);
    expect(flow.slots.startDate.ask(draft, ctx)).toContain("¿Qué día y a qué hora");
  });

  it("keeps incomplete low-confidence actions eligible for questions", () => {
    const ctx = {
      user: { locale: "es" }, userId: "user-1", phone: "5215512345678", mode: "personal" as const,
    } as Parameters<typeof hasMissingSlotFields>[1];

    expect(hasMissingSlotFields({ intent: "recurring_create", confidence: 0.4 }, ctx)).toBe(true);
    expect(FLOWS.recurring_create!.slots.type.ask({}, ctx)).toContain("¿Es un gasto o un ingreso");
  });

  it("parses the day-of-month written out in Portuguese", () => {
    const parse = slotDayOfMonth();
    expect(parse("dia cinco", {}, {} as never)).toEqual({ ok: true, value: 5 });
    expect(parse("vinte e um", {}, {} as never)).toEqual({ ok: true, value: 21 });
    expect(parse("trinta e um", {}, {} as never)).toEqual({ ok: true, value: 31 });
    expect(parse("vigésimo primeiro", {}, {} as never)).toEqual({ ok: true, value: 21 });
  });

  it("parses the day-of-month written out in Spanish (parser is locale-agnostic)", () => {
    const parse = slotDayOfMonth();
    expect(parse("quince", {}, {} as never)).toEqual({ ok: true, value: 15 });
    expect(parse("veintiuno", {}, {} as never)).toEqual({ ok: true, value: 21 });
    expect(parse("treinta y uno", {}, {} as never)).toEqual({ ok: true, value: 31 });
    expect(parse("vigésimo primero", {}, {} as never)).toEqual({ ok: true, value: 21 });
  });
});
