import { beforeEach, describe, expect, it, vi } from "vitest";

const { createReminder, updateReminder } = vi.hoisted(() => ({
  createReminder: vi.fn(),
  updateReminder: vi.fn(),
}));
vi.mock("./reminders", () => ({ createReminder, updateReminder }));

import { FLOWS } from "./slot-filling";

describe("reminder recipient correction", () => {
  beforeEach(() => {
    createReminder.mockReset();
    updateReminder.mockReset();
  });

  it("updates the original reminder's destination when given a WhatsApp number", async () => {
    updateReminder.mockResolvedValue({
      id: "rem-1", message: "Não vou treinar", scheduledAt: "2026-10-08T13:00:00.000Z",
      repeat: "none", recipientType: "other",
    });
    const ctx = {
      user: { locale: "pt-BR" }, userId: "user-1",
      phone: "5544999999999", mode: "personal" as const,
    } as Parameters<NonNullable<typeof FLOWS.reminder_set>["finalize"]>[1];
    const reply = await FLOWS.reminder_set!.finalize({
      existingReminderId: "rem-1", recipientIsOther: true, recipientPhone: "5544888888888",
      message: "Não vou treinar",
    }, ctx);

    expect(updateReminder).toHaveBeenCalledWith("rem-1", "user-1", {
      phone: "5544888888888", recipientType: "other", recipientName: "",
    });
    expect(createReminder).not.toHaveBeenCalled();
    expect(reply).toContain("Corrigi o destinatário");
    expect(reply).toContain("essa pessoa");
  });
});
