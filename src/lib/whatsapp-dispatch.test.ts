import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  windowOpen: vi.fn(),
  addMessage: vi.fn(),
  sendText: vi.fn(),
  sendTemplate: vi.fn(),
  sendFile: vi.fn(),
  storeImage: vi.fn(),
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
  sendFile: mocks.sendFile,
}));

vi.mock("@/lib/evolution", () => ({
  sendText: vi.fn(),
}));

vi.mock("@/lib/support-attachments", () => ({ storeInboxImage: mocks.storeImage }));

import {runWithVirtualAgentReply,setVirtualAgentIdentity,setVirtualAgentIntent} from "./virtual-agent-replies";
import { sendReminderTemplate, sendWelcomeTemplate,sendText,sendFile } from "./whatsapp";

describe("proactive WABA dispatch", () => {
  it("redacts financial notices sent through an approved template from future AI prompts",async()=>{
    mocks.windowOpen.mockResolvedValue(false);
    await sendReminderTemplate("5511999999999","lbt_pessoal","Fatura do banco",{texto:"Fatura do banco"},"pt-BR",{privateFinancial:true});
    expect(mocks.addMessage).toHaveBeenLastCalledWith("5511999999999",expect.objectContaining({privateFinancial:true}));
  });
  it("marks private bank replies for redaction while preserving the actual customer message",async()=>{
    mocks.sendText.mockResolvedValue(true);
    await sendText("5511999999999","Private bank reply",{privateFinancial:true});
    expect(mocks.addMessage).toHaveBeenLastCalledWith("5511999999999",expect.objectContaining({content:"Private bank reply",privateFinancial:true}));
  });
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

it("sends a personalized agent receipt and preserves private financial redaction",async()=>{
 mocks.sendText.mockResolvedValue(true);
 const receipt="✅ Gasto registrado\nR$ 50,00 · Saúde · Farmácia";
 await runWithVirtualAgentReply("5511988881111",async()=>{
  setVirtualAgentIdentity("Juliana Silva","pt-BR");setVirtualAgentIntent("finance_add");
  await sendText("5511988881111",receipt,{privateFinancial:true});
 });
 expect(mocks.sendText).toHaveBeenLastCalledWith("5511988881111",expect.stringContaining("*Juliana*"));
 expect(mocks.addMessage).toHaveBeenLastCalledWith("5511988881111",expect.objectContaining({privateFinancial:true,content:expect.stringContaining(receipt)}));
 expect(mocks.sendText.mock.lastCall?.[1]).toContain("*Rita*");
});

it("decorates bank file captions only for the identified recipient and keeps private redaction",async()=>{
 mocks.sendFile.mockResolvedValue(true);const buffer=Buffer.from("fixture");
 await runWithVirtualAgentReply("5511988881111",async()=>{
  setVirtualAgentIdentity("Juliana","pt-BR");setVirtualAgentIntent("finance_query");
  await sendFile("5511977772222",buffer,"other.pdf","application/pdf","Convite");
  await sendFile("5511988881111",buffer,"fatura.pdf","application/pdf","Fatura do cartão",{privateFinancial:true});
 });
 expect(mocks.sendFile.mock.calls[0][4]).toBe("Convite");
 expect(mocks.sendFile.mock.lastCall?.[4]).toContain("*Rita*");
 expect(mocks.sendFile.mock.lastCall?.[4]).toContain("Fatura do cartão");
 expect(mocks.addMessage).toHaveBeenLastCalledWith("5511988881111",expect.objectContaining({privateFinancial:true,content:expect.stringContaining("*Juliana*")}));
});

it("keeps the sent photo and caption in the Inbox after WhatsApp accepts the send", async () => {
  const phone = "5511988881111";
  const buffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
  const mediaUrl = `/api/admin/inbox/image?phone=${phone}&file=550e8400-e29b-41d4-a716-446655440000.jpg`;
  mocks.sendFile.mockResolvedValueOnce(true);
  mocks.storeImage.mockResolvedValueOnce(mediaUrl);

  await expect(sendFile(phone, buffer, "foto.jpg", "image/jpeg", "Legenda")).resolves.toBe(true);
  expect(mocks.sendFile).toHaveBeenLastCalledWith(phone, buffer, "foto.jpg", "image/jpeg", "Legenda");
  expect(mocks.storeImage).toHaveBeenLastCalledWith(phone, buffer);
  expect(mocks.addMessage).toHaveBeenLastCalledWith(phone, {
    role: "assistant", type: "image", content: "Legenda", mediaUrl, ts: expect.any(Number),
  });
});

it("does not record a rejected photo or report a failed send when only the preview fails", async () => {
  const phone = "5511988881111";
  const buffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
  mocks.storeImage.mockClear();
  mocks.addMessage.mockClear();
  mocks.sendFile.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  mocks.storeImage.mockRejectedValueOnce(new Error("Storage temporarily unavailable"));

  await expect(sendFile(phone, buffer, "foto.jpg", "image/jpeg")).resolves.toBe(false);
  expect(mocks.storeImage).not.toHaveBeenCalled();
  expect(mocks.addMessage).not.toHaveBeenCalled();

  await expect(sendFile(phone, buffer, "foto.jpg", "image/jpeg")).resolves.toBe(true);
  expect(mocks.addMessage).toHaveBeenLastCalledWith(phone, expect.objectContaining({
    role: "assistant", content: "📷 Imagem enviada · prévia indisponível",
  }));
});
