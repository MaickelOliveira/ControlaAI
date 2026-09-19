import { describe, expect, it } from "vitest";
import { isAllDayAgendaText } from "./agenda-all-day";
import { normalizeMeetingCreation, withExplicitAgendaAllDay } from "./ai-processor";
import { replyAgendaCreated, replyAgendaList, replyAgendaUpdated } from "./bot-replies";
import { FLOWS } from "./slot-filling";
import type { Appointment } from "./agenda";

const allDayAppointment: Appointment = {
  id: "appointment-all-day",
  userId: "user-1",
  title: "Feira do Disco",
  startAt: "2026-09-19T03:00:00.000Z",
  allDay: true,
  repeat: "none",
  status: "scheduled",
  source: "whatsapp",
  createdAt: "2026-09-01T12:00:00.000Z",
};

describe("all-day agenda commands", () => {
  it.each([
    "Dia todo",
    "o dia todo",
    "dia inteiro",
    "todo o dia",
    "todo el día",
    "all day",
  ])("recognizes %s", text => {
    expect(isAllDayAgendaText(text)).toBe(true);
  });

  it("does not override an explicitly denied all-day request", () => {
    expect(isAllDayAgendaText("não é dia todo, marque às 14h")).toBe(false);
  });

  it("forces agenda data to all-day even if the model returned midnight", () => {
    const result = withExplicitAgendaAllDay("Feira do Disco dia todo", {
      intent: "agenda_create",
      confidence: 0.95,
      agendaData: {
        title: "Feira do Disco",
        startDate: "2026-09-19",
        startTime: "00:00",
      },
    });

    expect(result.agendaData).toMatchObject({ allDay: true });
    expect(result.agendaData?.startTime).toBeUndefined();
  });

  it("keeps an all-day meeting as an agenda event instead of requiring a Meet time", () => {
    const result = normalizeMeetingCreation("Reunião da empresa dia todo", {
      intent: "agenda_create",
      confidence: 0.95,
      agendaData: { title: "Reunião da empresa", startDate: "2026-09-19" },
    });
    expect(result.intent).toBe("agenda_create");
  });

  it("creates the all-day patch when an existing appointment is updated", () => {
    expect(withExplicitAgendaAllDay("deixa a feira como dia inteiro", {
      intent: "agenda_update",
      confidence: 0.9,
      keyword: "feira",
    })).toMatchObject({
      intent: "agenda_update",
      agendaData: { allDay: true },
    });
  });

  it("marks the pending time slot as all-day", () => {
    const slot = FLOWS.agenda_create!.slots.startTime;
    const draft: Record<string, unknown> = {};
    const parsed = slot.parse("Dia todo", draft, {} as never);
    expect(parsed).toEqual({ ok: true, value: "ALLDAY" });
    if (parsed.ok) slot.apply?.(parsed.value, draft, [], {} as never);
    expect(draft).toMatchObject({ allDay: true });
    expect(FLOWS.agenda_create!.missing({ title: "Feira", startDate: "2026-09-19", ...draft }, {} as never)).toEqual([]);
  });

  it("confirms and lists the appointment as all-day instead of midnight", () => {
    const created = replyAgendaCreated(allDayAppointment, "pt-BR");
    const listed = replyAgendaList([allDayAppointment], "pt-BR");
    const updated = replyAgendaUpdated(allDayAppointment, "pt-BR");

    for (const message of [created, listed, updated]) {
      expect(message).toContain("Dia inteiro");
      expect(message).not.toContain("00:00");
    }
    expect(created).not.toContain("2 horas antes");
  });

  it("uses the Spanish all-day label", () => {
    expect(replyAgendaCreated(allDayAppointment, "es")).toContain("Todo el día");
  });
});
