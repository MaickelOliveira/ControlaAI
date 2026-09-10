import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  windowOpen: vi.fn(),
  addMessage: vi.fn(),
  sendText: vi.fn(),
  sendTemplate: vi.fn(),
}));

vi.mock("@/lib/whatsapp-config", () => ({
  getConfig: vi.fn().mockResolvedValue({ provider: "waba" }),
}));

vi.mock("@/lib/conversations", () => ({
  hasOpenCustomerServiceWindow: mocks.windowOpen,
  addMessage: mocks.addMessage,
}));

vi.mock("@/lib/waba", () => ({
  sendText: mocks.sendText,
  sendTemplate: mocks.sendTemplate,
}));

vi.mock("@/lib/evolution", () => ({
  sendText: vi.fn(),
}));

import { sendReminderTemplate, sendWelcomeTemplate } from "./whatsapp";

describe("proactive WABA dispatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sendText.mockResolvedValue(true);
    mocks.sendTemplate.mockResolvedValue({ ok: true, messageId: "wamid.test" });
  });

  it("uses free text when the customer replied within 24 hours", async () => {
    mocks.windowOpen.mockResolvedValue(true);

    await expect(sendReminderTemplate(
      "5511999999999",
      "cbr_recorrente",
      "Mensagem completa",
      { descricao: "Aluguel", valor: "R$ 700,00", data: "10/09/2026" },
      "pt-BR",
    )).resolves.toBe(true);

    expect(mocks.sendText).toHaveBeenCalledWith("5511999999999", "Mensagem completa", "BR");
    expect(mocks.sendTemplate).not.toHaveBeenCalled();
  });

  it("uses the approved template when the 24-hour window is closed", async () => {
    mocks.windowOpen.mockResolvedValue(false);

    await expect(sendReminderTemplate(
      "5511999999999",
      "cbr_recorrente",
      "Prévia local",
      { descricao: "Aluguel", valor: "R$ 700,00", data: "10/09/2026" },
      "pt-BR",
    )).resolves.toBe(true);

    expect(mocks.sendText).not.toHaveBeenCalled();
    expect(mocks.sendTemplate).toHaveBeenCalledWith(
      "5511999999999",
      "cbr_recorrente",
      "pt_BR",
      { descricao: "Aluguel", valor: "R$ 700,00", data: "10/09/2026" },
      "BR",
    );
  });

  it("falls back to the template if Meta rejects free text", async () => {
    mocks.windowOpen.mockResolvedValue(true);
    mocks.sendText.mockResolvedValue(false);

    await expect(sendReminderTemplate(
      "5511999999999",
      "lbt_pessoal",
      "Lembrete completo",
      { texto: "Tomar remédio" },
      "pt-BR",
    )).resolves.toBe(true);

    expect(mocks.sendText).toHaveBeenCalledOnce();
    expect(mocks.sendTemplate).toHaveBeenCalledOnce();
  });

  it("applies the same rule to the welcome message", async () => {
    mocks.windowOpen.mockResolvedValue(true);

    await expect(sendWelcomeTemplate("5511999999999", "pt-BR")).resolves.toBe(true);

    expect(mocks.sendText).toHaveBeenCalledOnce();
    expect(mocks.sendTemplate).not.toHaveBeenCalled();
  });
});
