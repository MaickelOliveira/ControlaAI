import { describe, expect, it } from "vitest";
import { nextReminderOccurrenceAfter, resolveInitialScheduledAt } from "./reminders";

describe("resolveInitialScheduledAt", () => {
  const now = new Date("2026-09-24T14:13:07.000Z");

  it("keeps a future scheduledAt untouched", () => {
    expect(resolveInitialScheduledAt("2026-09-25T14:13:00.000Z", "none", now))
      .toBe("2026-09-25T14:13:00.000Z");
  });

  it("fires almost immediately for an 'agora' request instead of jumping a full day (the reported bug)", () => {
    // "agora" chega com o instante exato da resposta da IA — alguns segundos
    // de processamento até createReminder já bastam pra ficar no passado.
    expect(resolveInitialScheduledAt("2026-09-24T14:13:00.000Z", "none", now)).toBe(now.toISOString());
  });

  it("fires almost immediately for a small processing delay on any repeat mode", () => {
    expect(resolveInitialScheduledAt("2026-09-24T14:10:00.000Z", "daily", now)).toBe(now.toISOString());
    expect(resolveInitialScheduledAt("2026-09-24T14:10:00.000Z", "weekly", now)).toBe(now.toISOString());
  });

  it("pushes to the next cycle when the requested time has clearly passed", () => {
    expect(resolveInitialScheduledAt("2026-09-24T09:00:00.000Z", "none", now)).toBe("2026-09-25T09:00:00.000Z");
    expect(resolveInitialScheduledAt("2026-09-24T09:00:00.000Z", "weekly", now)).toBe("2026-10-01T09:00:00.000Z");
    expect(resolveInitialScheduledAt("2026-09-24T09:00:00.000Z", "monthly", now)).toBe("2026-10-24T09:00:00.000Z");
  });
});

describe("nextReminderOccurrenceAfter", () => {
  const now = new Date("2026-09-06T15:00:00.000Z");

  it("skips every missed daily occurrence and schedules the next future one", () => {
    expect(nextReminderOccurrenceAfter("2026-09-03T12:00:00.000Z", "daily", now))
      .toBe("2026-09-07T12:00:00.000Z");
  });

  it("advances weekly reminders without sending a catch-up sequence", () => {
    expect(nextReminderOccurrenceAfter("2026-08-20T12:00:00.000Z", "weekly", now))
      .toBe("2026-09-10T12:00:00.000Z");
  });

  it("closes one-time reminders that expired while access was inactive", () => {
    expect(nextReminderOccurrenceAfter("2026-09-03T12:00:00.000Z", "none", now)).toBeNull();
  });
});
