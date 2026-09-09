import { describe, expect, it } from "vitest";
import {
  appointmentReminderAt,
  formatReminderOffset,
  isAgendaReminderTarget,
  isStandaloneAppointmentReminderRequest,
  parseAppointmentReminderRequest,
} from "./appointment-reminders";
import { replyAgendaCreated, replyAgendaReminderPolicy, replyAppointmentReminder } from "./bot-replies";

describe("parseAppointmentReminderRequest", () => {
  it("understands the exact reported one-hour reminder", () => {
    expect(parseAppointmentReminderRequest("Me avisa uma hora antes da reunião.")).toEqual({
      offsetMinutes: 60,
      keyword: "reunião",
    });
  });

  it("supports minutes and appointment names", () => {
    expect(parseAppointmentReminderRequest("me lembre 30 minutos antes da consulta médica")).toEqual({
      offsetMinutes: 30,
      keyword: "consulta médica",
    });
  });

  it("supports combined hours and minutes", () => {
    expect(parseAppointmentReminderRequest("avise 1 hora e 30 minutos antes do encontro")).toEqual({
      offsetMinutes: 90,
      keyword: "encontro",
    });
  });

  it("supports equivalent Spanish reminders", () => {
    expect(parseAppointmentReminderRequest("Avísame una hora antes de la reunión con Ana")).toEqual({
      offsetMinutes: 60,
      keyword: "reunión con Ana",
    });
    expect(parseAppointmentReminderRequest("Recuérdame treinta minutos antes del médico")).toEqual({
      offsetMinutes: 30,
      keyword: "médico",
    });
  });

  it("keeps a reminder from a newly-created appointment even without a repeated title", () => {
    expect(parseAppointmentReminderRequest("Tenho uma reunião dia 9 às 17h. Me avisa uma hora antes.")).toEqual({
      offsetMinutes: 60,
      keyword: undefined,
    });
  });

  it("does not claim a reminder when the duration is missing", () => {
    expect(parseAppointmentReminderRequest("me avisa antes da reunião")).toBeNull();
  });

  it("separates Agenda alerts from ordinary reminders", () => {
    const meeting = parseAppointmentReminderRequest("Me avisa uma hora antes da reunião.")!;
    const medicine = parseAppointmentReminderRequest("Me lembre uma hora antes de tomar o remédio.")!;
    expect(isAgendaReminderTarget(meeting)).toBe(true);
    expect(isAgendaReminderTarget(medicine)).toBe(false);
  });

  it("distinguishes a direct reminder from a new appointment with a reminder", () => {
    expect(isStandaloneAppointmentReminderRequest("Me avisa uma hora antes da reunião.")).toBe(true);
    expect(isStandaloneAppointmentReminderRequest("Avísame una hora antes de la reunión.")).toBe(true);
    expect(isStandaloneAppointmentReminderRequest("Marque uma reunião amanhã e me avise uma hora antes.")).toBe(false);
    expect(isStandaloneAppointmentReminderRequest("Crea una reunión mañana y avísame una hora antes.")).toBe(false);
  });
});

describe("appointment reminder scheduling", () => {
  it("subtracts the requested offset from the appointment", () => {
    expect(appointmentReminderAt("2026-09-09T20:00:00.000Z", 60)).toBe("2026-09-09T19:00:00.000Z");
  });

  it("formats offsets for confirmations", () => {
    expect(formatReminderOffset(15)).toBe("15 minutos");
    expect(formatReminderOffset(60)).toBe("1 hora");
    expect(formatReminderOffset(90)).toBe("1h30");
    expect(formatReminderOffset(1_440, "es")).toBe("1 día");
  });
});

describe("Spanish appointment template text", () => {
  const appointment = {
    id: "appointment-1",
    userId: "user-1",
    title: "Reunión con el contador",
    startAt: "2026-09-06T17:30:00.000Z",
    allDay: false,
    repeat: "none" as const,
    status: "scheduled" as const,
    source: "whatsapp" as const,
    createdAt: "2026-09-01T12:00:00.000Z",
  };

  it("matches the two-hour Spanish Meta template", () => {
    expect(replyAppointmentReminder(appointment, "2 horas", "es")).toBe(
      "📅 Evento próximo\n\nReunión con el contador comenzará en aproximadamente 2 horas, a las 14:30.\n\nEste aviso corresponde a un evento registrado previamente en tu agenda de Zelo.",
    );
  });

  it("matches the fifteen-minute Spanish Meta template", () => {
    expect(replyAppointmentReminder(appointment, "15 minutos", "es")).toBe(
      "⏰ Evento en breve\n\nReunión con el contador comenzará en aproximadamente 15 minutos, a las 14:30.\n\nEste aviso corresponde a un evento registrado previamente en tu agenda de Zelo.",
    );
  });

  it("explains the fixed Agenda alerts in the correct language", () => {
    expect(replyAgendaReminderPolicy("pt-BR")).toContain("*2 horas antes* e *15 minutos antes*");
    expect(replyAgendaReminderPolicy("pt-BR")).not.toContain("Las reuniones");
    expect(replyAgendaReminderPolicy("es")).toContain("*2 horas antes* y *15 minutos antes*");
    expect(replyAgendaReminderPolicy("es")).not.toContain("Os compromissos");
  });

  it("includes both automatic alerts when an appointment is created", () => {
    expect(replyAgendaCreated(appointment, "pt-BR")).toContain("*2 horas antes* e *15 minutos antes*");
    expect(replyAgendaCreated(appointment, "es")).toContain("*2 horas antes* y *15 minutos antes*");
  });
});
