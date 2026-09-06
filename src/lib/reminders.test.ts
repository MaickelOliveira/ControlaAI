import { describe, expect, it } from "vitest";
import { nextReminderOccurrenceAfter } from "./reminders";

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
