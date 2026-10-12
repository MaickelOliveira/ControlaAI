import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ owner: vi.fn(), send: vi.fn(), process: vi.fn(), access: vi.fn(), find: vi.fn(), range: vi.fn(), remove: vi.fn(), update: vi.fn(), pending: vi.fn(), clear: vi.fn(), setPending: vi.fn(), batch: vi.fn(), code: vi.fn(), count: vi.fn(), financeCount: vi.fn(), removeAll: vi.fn(), balance: vi.fn(), rangeBalance: vi.fn(), accounts: vi.fn(), due: vi.fn(), confirm: vi.fn() }));
vi.mock("./users", async original => ({ ...await original<typeof import("./users")>(), getUserById: m.owner, generateWppVerifyCode: m.code }));
vi.mock("./wpp-phone-links", () => ({ getUserIdByPhone: async () => "fixture-owner", getPhoneAccess: m.access, getPhonesForUser: async () => [{ userId: "fixture-owner", phone: "5511999990000", name: "Fixture", relation: "Titular" }], countPhonesForUser: m.count, findPhoneByName: async () => "5511999990002", findPhoneByRelation: async () => null }));
vi.mock("./pending-actions", async original => ({ ...await original<typeof import("./pending-actions")>(), getPendingAction: m.pending, clearPendingAction: m.clear, setPendingAction: m.setPending }));
vi.mock("./conversations", async original => ({ ...await original<typeof import("./conversations")>(), addMessage: vi.fn(), getAiPaused: async () => false, getAiHistory: async () => [], getLastFinanceBatch: m.batch }));
vi.mock("./whatsapp", () => ({ sendText: m.send, sendFile: vi.fn() }));
vi.mock("./whatsapp-config", () => ({ getConfig: async () => ({}) }));
vi.mock("./ai-processor", async original => ({ ...await original<typeof import("./ai-processor")>(), processMessage: m.process }));
vi.mock("./finances", async original => ({ ...await original<typeof import("./finances")>(), findFinanceByDescription: m.find, getFinancesInRange: m.range, deleteFinance: m.remove, updateFinance: m.update, countFinances: m.financeCount, deleteAllFinances: m.removeAll, getBalance: m.balance, getBalanceInRange: m.rangeBalance }));
vi.mock("./accounts", async original => ({ ...await original<typeof import("./accounts")>(), getManualAccountsByUser: m.accounts }));
vi.mock("./recurring", async original => ({ ...await original<typeof import("./recurring")>(), findDueRecurringMatches: m.due, confirmRecurring: m.confirm }));
import { handleIncomingMessage } from "./message-handler";
type Mode = "personal" | "business";
const entry = (mode: Mode) => ({ id: `fixture-${mode}`, userId: "fixture-owner", type: "expense", description: `${mode} private entry`, amount: 50, category: "Outros", mode, date: "2026-10-12", source: "web", status: "confirmed", createdAt: "2026-10-12" });
let rows: ReturnType<typeof entry>[];
const reply = () => m.send.mock.calls.map(call => call[1]).join("\n");
const receive = (text: string) => handleIncomingMessage({ from: "5511999990000", text });
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("MULTI_COMPANY_ENABLED", "false"); vi.stubEnv("OPEN_FINANCE_WHATSAPP_ENABLED", "false");
  rows = [entry("personal")];
  m.owner.mockResolvedValue({ id: "fixture-owner", name: "Fixture Owner", phone: "5511999990001", email: "fixture@example.test", plan: "business", status: "active", activeMode: "business", locale: "pt-BR" });
  m.access.mockResolvedValue("business"); m.send.mockResolvedValue(true); m.pending.mockResolvedValue(null); m.batch.mockResolvedValue(null); m.count.mockResolvedValue(1); m.code.mockResolvedValue("fixture-code");
  m.process.mockResolvedValue({ intent: "finance_delete", confidence: .99, keyword: "private entry" });
  m.find.mockImplementation(async (_owner, mode) => rows.filter(row => !mode || row.mode === mode));
  m.range.mockImplementation(async (_owner, mode) => rows.filter(row => !mode || row.mode === mode));
  m.remove.mockResolvedValue(true); m.update.mockImplementation(async (id, _owner, patch) => ({ ...rows.find(row => row.id === id), ...patch }));
  m.financeCount.mockResolvedValue(2); m.removeAll.mockResolvedValue(2);
  m.balance.mockResolvedValue({ income: 80, expense: 10, balance: 70 }); m.rangeBalance.mockResolvedValue({ income: 80, expense: 10, balance: 70 });
  m.accounts.mockResolvedValue([]); m.due.mockResolvedValue([]); m.confirm.mockResolvedValue(null);
});
afterEach(() => vi.unstubAllEnvs());

it.each(["finance_delete", "finance_edit"])("prevents a business-only participant from finding or changing personal data through %s", async intent => {
  m.process.mockResolvedValue({ intent, confidence: .99, keyword: "private entry", finance: { amount: 80 } });
  await receive(intent === "finance_delete" ? "apague o lançamento private entry" : "mude o lançamento private entry para 80 reais");
  expect(m.remove).not.toHaveBeenCalled(); expect(m.update).not.toHaveBeenCalled();
  expect(reply()).not.toContain("personal private entry");
  expect(m.find.mock.calls.every(call => call[1] === "business")).toBe(true);
  expect(m.range.mock.calls.every(call => call[1] === "business")).toBe(true);
});
it.each(["personal", "business"] as const)("preserves deletion in the participant's permitted %s mode", async mode => {
  m.access.mockResolvedValue(mode); rows = [entry(mode)];
  await receive("apague o lançamento private entry");
  expect(m.remove).toHaveBeenCalledExactlyOnceWith(`fixture-${mode}`, "fixture-owner", mode);
});
it("keeps access to both modes for a participant authorized for both", async () => {
  m.access.mockResolvedValue("both");
  await receive("apague o lançamento private entry");
  expect(m.remove).toHaveBeenCalledExactlyOnceWith("fixture-personal", "fixture-owner", undefined);
});
it("rejects stored selection candidates outside the participant's current access", async () => {
  m.pending.mockResolvedValue({ type: "finance_select", userId: "fixture-owner", action: "delete", candidates: [entry("personal")] });
  await receive("1");
  expect(m.remove).not.toHaveBeenCalled(); expect(m.clear).toHaveBeenCalled();
  expect(reply()).not.toContain("personal private entry");
});
it("rejects moving a business record into a restricted personal mode", async () => {
  rows = [entry("business")];
  m.process.mockResolvedValue({ intent: "finance_edit", confidence: .99, keyword: "private entry", finance: { newMode: "personal" } });
  await receive("mude o lançamento private entry para pessoal");
  expect(m.update).not.toHaveBeenCalled();
});
it("rejects a generic delete batch from a different permitted mode", async () => {
  m.batch.mockResolvedValue({ mode: "personal", items: [entry("personal")] });
  m.process.mockResolvedValue({ intent: "finance_delete", confidence: .99, bulkCorrectLastBatch: true });
  await receive("apaga esses lançamentos");
  expect(m.remove).not.toHaveBeenCalled();
});
it("does not issue an enrollment code to a participant declaring the Titular relation", async () => {
  await receive("gerar código de vinculação");
  expect(m.code).not.toHaveBeenCalled();
});
it("allows the registered owner phone to issue the enrollment code", async () => {
  m.owner.mockResolvedValue({ id: "fixture-owner", name: "Fixture Owner", phone: "5511999990000", email: "fixture@example.test", plan: "business", status: "active", activeMode: "business", locale: "pt-BR" });
  await receive("gerar código de vinculação");
  expect(m.code).toHaveBeenCalledExactlyOnceWith("fixture-owner");
});
it("does not count or offer deleting the other mode's entire history to a restricted participant", async () => {
  m.process.mockResolvedValue({ intent: "finance_clear_history", confidence: .99, mode: "personal" });
  await receive("apagar histórico pessoal");
  expect(m.financeCount).not.toHaveBeenCalled(); expect(m.removeAll).not.toHaveBeenCalled();
  expect(m.setPending).not.toHaveBeenCalled();
});
it("does not execute a cross-mode or both-mode history confirmation saved before access changed", async () => {
  for (const mode of ["personal", "both"]) {
    m.pending.mockResolvedValue({ type: "confirm_clear_history", userId: "fixture-owner", mode, count: 2 });
    await receive("apagar tudo");
  }
  expect(m.removeAll).not.toHaveBeenCalled(); expect(m.clear).toHaveBeenCalled();
});
it.each([
  ["balance_query", undefined, "qual é meu saldo"],
  ["finance_query", "Juliana", "quanto Juliana gastou"],
  ["unknown", undefined, "me envie o resumo agora"],
])("does not read or render personal balances for a business-only participant through %s", async (intent, personName, text) => {
  m.process.mockResolvedValue({ intent, confidence: .99, personName });
  await receive(text!);
  const calls = [...m.balance.mock.calls, ...m.rangeBalance.mock.calls];
  expect(calls.length).toBeGreaterThan(0);
  expect(calls.every(call => call[1] === "business")).toBe(true);
  expect(reply()).toContain("*Empresa*"); expect(reply()).not.toContain("*Pessoal*");
});
it.each(["finance", "intent"])("blocks a personal recurring settlement inferred in the %s mode field before any lookup or confirmation", async field => {
  m.process.mockResolvedValue({ intent: "finance_register", confidence: .99, ...(field === "intent" ? { mode: "personal" } : {}), finance: { type: "expense", description: "aluguel", amount: 50, ...(field === "finance" ? { mode: "personal" } : {}) } });
  await receive("paguei o aluguel");
  expect(m.due).not.toHaveBeenCalled(); expect(m.confirm).not.toHaveBeenCalled();
  expect(reply()).toContain("empresarial");
});
it("does not query or reveal another mode's account during a pending account selection", async () => {
  const ownAccount = { id: "fixture-company-account", userId: "fixture-owner", name: "Caixa Empresa", type: "bank", mode: "business", isDefault: false, createdAt: "2026-10-12" };
  m.pending.mockResolvedValue({ type: "account_selection", userId: "fixture-owner", mode: "business", action: "resume_ai", ai: { intent: "finance_register", confidence: .99 }, originalText: "gastei 50 reais", accounts: [ownAccount] });
  m.accounts.mockResolvedValue([{ ...ownAccount, id: "fixture-personal-account", name: "Reserva pessoal", mode: "personal" }]);
  await receive("reserva pessoal");
  expect(m.accounts).not.toHaveBeenCalled(); expect(reply()).not.toContain("Reserva pessoal");
});
