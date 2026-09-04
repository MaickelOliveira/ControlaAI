import { describe, expect, it } from "vitest";
import {
  appointmentReminderAt,
  formatReminderOffset,
  parseAppointmentReminderRequest,
} from "./appointment-reminders";

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

  it("keeps a reminder from a newly-created appointment even without a repeated title", () => {
    expect(parseAppointmentReminderRequest("Tenho uma reunião dia 9 às 17h. Me avisa uma hora antes.")).toEqual({
      offsetMinutes: 60,
      keyword: undefined,
    });
  });

  it("does not claim a reminder when the duration is missing", () => {
    expect(parseAppointmentReminderRequest("me avisa antes da reunião")).toBeNull();
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
  });
});
