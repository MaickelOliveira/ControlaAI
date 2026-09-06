import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getDueReminders: vi.fn(),
  markReminderSent: vi.fn(),
  markReminderFailed: vi.fn(),
  markReminderSkippedForInactiveUser: vi.fn(),
  sendReminderTemplate: vi.fn(),
  acquireCronLock: vi.fn(),
  releaseCronLock: vi.fn(),
  getUserById: vi.fn(),
  hasAccess: vi.fn(),
}));

vi.mock("@/lib/reminders", () => ({
  getDueReminders: mocks.getDueReminders,
  markReminderSent: mocks.markReminderSent,
  markReminderFailed: mocks.markReminderFailed,
  markReminderSkippedForInactiveUser: mocks.markReminderSkippedForInactiveUser,
}));
vi.mock("@/lib/whatsapp", () => ({ sendReminderTemplate: mocks.sendReminderTemplate }));
vi.mock("@/lib/cron-lock", () => ({ acquireCronLock: mocks.acquireCronLock, releaseCronLock: mocks.releaseCronLock }));
vi.mock("@/lib/users", () => ({ getUserById: mocks.getUserById, hasAccess: mocks.hasAccess }));

import { GET } from "./route";

const reminder = {
  id: "reminder-1",
  userId: "user-1",
  message: "Tomar remédio",
  phone: "5511999999999",
  scheduledAt: "2026-09-06T12:00:00.000Z",
  repeat: "daily",
  mode: "personal",
  sent: false,
  failedAttempts: 0,
  recipientType: "self",
  createdAt: "2026-09-01T12:00:00.000Z",
} as const;

describe("cron de lembretes e assinatura", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-secret";
    mocks.acquireCronLock.mockResolvedValue("lock-1");
    mocks.releaseCronLock.mockResolvedValue(undefined);
    mocks.getDueReminders.mockResolvedValue([reminder]);
    mocks.getUserById.mockResolvedValue({ id: "user-1", status: "inactive", name: "Cliente" });
  });

  it("does not send and advances a reminder owned by an inactive account", async () => {
    mocks.hasAccess.mockReturnValue(false);

    const response = await GET(new NextRequest("http://localhost/api/cron/reminders?secret=test-secret"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.sendReminderTemplate).not.toHaveBeenCalled();
    expect(mocks.markReminderSkippedForInactiveUser).toHaveBeenCalledWith("reminder-1", "daily");
    expect(body.results).toEqual([{ id: "reminder-1", sent: false, skipped: "inactive_account" }]);
  });

  it("still sends reminders normally when the account is active", async () => {
    mocks.hasAccess.mockReturnValue(true);
    mocks.sendReminderTemplate.mockResolvedValue(true);

    await GET(new NextRequest("http://localhost/api/cron/reminders?secret=test-secret"));

    expect(mocks.sendReminderTemplate).toHaveBeenCalledTimes(1);
    expect(mocks.markReminderSent).toHaveBeenCalledWith("reminder-1", "daily");
    expect(mocks.markReminderSkippedForInactiveUser).not.toHaveBeenCalled();
  });
});
