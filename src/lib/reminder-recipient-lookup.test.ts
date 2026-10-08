import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  customers: vi.fn(), employees: vi.fn(), contacts: vi.fn(), links: vi.fn(),
  setPending: vi.fn(), clearPending: vi.fn(), createReminder: vi.fn(),
}));
vi.mock("./customers", () => ({ getCustomersByUser: mocks.customers }));
vi.mock("./employees", () => ({ getEmployeesByUser: mocks.employees }));
vi.mock("./contacts", () => ({ getContactsByUser: mocks.contacts }));
vi.mock("./wpp-phone-links", () => ({ getPhonesForUser: mocks.links }));
vi.mock("./pending-actions", () => ({
  setPendingAction: mocks.setPending, clearPendingAction: mocks.clearPending,
  parseAmountBR: vi.fn(),
}));
vi.mock("./reminders", () => ({ createReminder: mocks.createReminder, updateReminder: vi.fn() }));

import { beginSlotFill, runSlotFillTurn } from "./slot-filling";
import type { PendingSlotFill } from "./pending-actions";

const ctx = {
  user: { locale: "pt-BR" }, userId: "user-1",
  phone: "5544999999999", mode: "personal" as const,
} as Parameters<typeof beginSlotFill>[2];

function initialPending(): PendingSlotFill {
  return {
    type: "slot_fill", userId: "user-1", intent: "reminder_set",
    draft: { recipientIsOther: true, message: "", repeat: "none" },
    missing: ["recipientName", "message", "startDate", "startTime"],
    asked: 0, mode: "personal", originalText: "criar lembrete pra uma pessoa",
  } as PendingSlotFill;
}

describe("recipient lookup before reminder details", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.customers.mockResolvedValue([]);
    mocks.employees.mockResolvedValue([]);
    mocks.contacts.mockResolvedValue([]);
    mocks.links.mockResolvedValue([]);
  });

  it("asks for WhatsApp immediately when Carlos is not registered", async () => {
    const result = await runSlotFillTurn(initialPending(), "Carlos", ctx);
    expect(result.reply).toContain("Não encontrei *Carlos* nos seus cadastros");
    expect(mocks.setPending).toHaveBeenCalledWith(ctx.phone, expect.objectContaining({
      missing: ["recipientPhone", "message", "startDate", "startTime"],
    }));
    expect(mocks.createReminder).not.toHaveBeenCalled();
  });

  it("lists all distinct Carlos records and waits for a choice", async () => {
    mocks.customers.mockResolvedValue([
      { id: "c1", name: "Carlos Silva", phone: "5544111111111" },
      { id: "c2", name: "Carlos Oliveira", phone: "5544222222222" },
    ]);
    const first = await runSlotFillTurn(initialPending(), "Carlos", ctx);
    expect(first.reply).toContain("1. Carlos Silva");
    expect(first.reply).toContain("2. Carlos Oliveira");
    expect(mocks.createReminder).not.toHaveBeenCalled();
    const saved = mocks.setPending.mock.lastCall?.[1] as PendingSlotFill;
    const second = await runSlotFillTurn(saved, "2", ctx);
    expect(second.reply).toContain("O que você quer que eu lembre?");
    expect(mocks.setPending.mock.lastCall?.[1]).toEqual(expect.objectContaining({
      draft: expect.objectContaining({ recipientName: "Carlos Oliveira", recipientPhone: "5544222222222" }),
      missing: ["message", "startDate", "startTime"],
    }));
  });

  it("continues with the message when only one phone belongs to Carlos", async () => {
    mocks.contacts.mockResolvedValue([{ id: "k1", name: "Carlos Lima", phone: "5544333333333" }]);
    mocks.links.mockResolvedValue([{ name: "Carlos Lima", phone: "5544333333333" }]);
    const result = await beginSlotFill("reminder_set", {
      intent: "reminder_set", confidence: 1,
      reminder: { recipientIsOther: true, recipientName: "Carlos", message: "" },
    }, ctx, "avisar Carlos");
    expect(result.reply).toContain("O que você quer que eu lembre?");
    expect(mocks.setPending.mock.lastCall?.[1]).toEqual(expect.objectContaining({
      draft: expect.objectContaining({ recipientName: "Carlos Lima", recipientPhone: "5544333333333" }),
      missing: ["message", "startDate", "startTime"],
    }));
  });
});
