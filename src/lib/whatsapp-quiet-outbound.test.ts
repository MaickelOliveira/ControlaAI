import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ begin: vi.fn(), finish: vi.fn(), text: vi.fn(), template: vi.fn(), file: vi.fn(), history: vi.fn(), window: vi.fn() }));
vi.mock("./whatsapp-activity", () => ({ beginWhatsAppActivity: m.begin }));
vi.mock("./whatsapp-config", () => ({ getConfig: async () => ({ provider: "waba" }) }));
vi.mock("./conversations", () => ({ addMessage: m.history, hasOpenCustomerServiceWindow: m.window }));
vi.mock("./waba", () => ({ sendText: m.text, sendTemplate: m.template, sendFile: m.file }));
vi.mock("./evolution", () => ({}));
import { sendFile, sendReminderTemplate, sendText } from "./whatsapp";

const phone = "5511999990000";
const cases = [
  { name: "text", send: () => sendText(phone, "Resposta fictícia", { privateFinancial: true }), transport: m.text },
  { name: "reminder", send: () => sendReminderTemplate(phone, "lbt_pessoal", "Aviso fictício", { texto: "Aviso fictício" }, "pt-BR", { privateFinancial: true }), transport: m.template },
  { name: "file", send: () => sendFile(phone, Buffer.from("fixture"), "fixture.pdf", "application/pdf", "Arquivo fictício", { privateFinancial: true }), transport: m.file },
];
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("OPEN_FINANCE_CREDIT_PIX_QUESTIONS_ENABLED", "true");
  m.begin.mockResolvedValue({ finish: m.finish }); m.finish.mockResolvedValue(undefined);
  m.text.mockResolvedValue(true); m.template.mockResolvedValue({ ok: true, messageId: "wamid.fixture" }); m.file.mockResolvedValue(true);
  m.window.mockResolvedValue(false); m.history.mockResolvedValue(undefined);
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("outgoing activity preserves transport outcomes", () => {
  it.each(cases)("accepted $name remains successful when cleanup fails, permitting the caller to mark it sent", async ({ send, transport }) => {
    m.finish.mockRejectedValue(Error("cleanup unavailable"));
    const markSent = vi.fn();
    if (await send()) markSent();
    expect(markSent).toHaveBeenCalledTimes(1);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(m.begin).toHaveBeenCalledWith(phone, "notice");
    expect(m.begin.mock.invocationCallOrder[0]).toBeLessThan(transport.mock.invocationCallOrder[0]);
    expect(m.history).toHaveBeenCalledWith(phone, expect.objectContaining({ role: "assistant", privateFinancial: true }));
    expect(m.finish).toHaveBeenCalledTimes(1);
  });
  it.each(cases)("$name still fails closed before transport when activity cannot be reserved", async ({ send }) => {
    m.begin.mockRejectedValue(Error("activity unavailable"));
    await expect(send()).rejects.toThrow("activity unavailable");
    expect(m.text).not.toHaveBeenCalled(); expect(m.template).not.toHaveBeenCalled(); expect(m.file).not.toHaveBeenCalled();
    expect(m.history).not.toHaveBeenCalled(); expect(m.finish).not.toHaveBeenCalled();
  });
  it.each(cases)("$name works without any activity RPC when the feature is disabled", async ({ send, transport }) => {
    vi.stubEnv("OPEN_FINANCE_CREDIT_PIX_QUESTIONS_ENABLED", "false");
    expect(await send()).toBe(true);
    expect(transport).toHaveBeenCalledTimes(1); expect(m.begin).not.toHaveBeenCalled(); expect(m.finish).not.toHaveBeenCalled();
  });
  it("cleanup failure does not turn rejected transport into success or store private history", async () => {
    m.text.mockResolvedValue(false); m.finish.mockRejectedValue(Error("cleanup unavailable"));
    expect(await sendText(phone, "Mensagem fictícia")).toBe(false);
    expect(m.text).toHaveBeenCalledTimes(1); expect(m.history).not.toHaveBeenCalled(); expect(m.finish).toHaveBeenCalledTimes(1);
  });
  it("cleanup does not replace the original transport exception", async () => {
    m.file.mockRejectedValue(Error("transport unavailable")); m.finish.mockRejectedValue(Error("cleanup unavailable"));
    await expect(sendFile(phone, Buffer.from("fixture"), "fixture.pdf", "application/pdf")).rejects.toThrow("transport unavailable");
    expect(m.file).toHaveBeenCalledTimes(1); expect(m.history).not.toHaveBeenCalled(); expect(m.finish).toHaveBeenCalledTimes(1);
  });
});
