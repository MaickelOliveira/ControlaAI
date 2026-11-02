import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ owner: vi.fn(), userUpdate: vi.fn(), send: vi.fn(), process: vi.fn(), access: vi.fn(), find: vi.fn(), range: vi.fn(), remove: vi.fn(), update: vi.fn(), pending: vi.fn(), clear: vi.fn(), setPending: vi.fn(), batch: vi.fn(), code: vi.fn(), count: vi.fn(), financeCount: vi.fn(), removeAll: vi.fn(), balance: vi.fn(), rangeBalance: vi.fn(), accounts: vi.fn(), due: vi.fn(), confirm: vi.fn(), createCategory: vi.fn() }));
vi.mock("./users", async original => ({ ...await original<typeof import("./users")>(), getUserById: m.owner, updateUser: m.userUpdate, generateWppVerifyCode: m.code }));
vi.mock("./wpp-phone-links", () => ({ getUserIdByPhone: async () => "fixture-owner", getPhoneAccess: m.access, getPhonesForUser: async () => [{ userId: "fixture-owner", phone: "5511999990000", name: "Fixture", relation: "Titular" }], countPhonesForUser: m.count, findPhoneByName: async () => "5511999990002", findPhoneByRelation: async () => null }));
vi.mock("./pending-actions", async original => ({ ...await original<typeof import("./pending-actions")>(), getPendingAction: m.pending, clearPendingAction: m.clear, setPendingAction: m.setPending }));
vi.mock("./conversations", async original => ({ ...await original<typeof import("./conversations")>(), addMessage: vi.fn(), getAiPaused: async () => false, getAiHistory: async () => [], getLastFinanceBatch: m.batch }));
vi.mock("./whatsapp", () => ({ sendText: m.send, sendFile: vi.fn() }));
vi.mock("./whatsapp-config", () => ({ getConfig: async () => ({}) }));
vi.mock("./ai-processor", async original => ({ ...await original<typeof import("./ai-processor")>(), processMessage: m.process }));
vi.mock("./finances", async original => ({ ...await original<typeof import("./finances")>(), findFinanceByDescription: m.find, getFinancesInRange: m.range, deleteFinance: m.remove, updateFinance: m.update, countFinances: m.financeCount, deleteAllFinances: m.removeAll, getBalance: m.balance, getBalanceInRange: m.rangeBalance }));
vi.mock("./accounts", async original => ({ ...await original<typeof import("./accounts")>(), getManualAccountsByUser: m.accounts }));
vi.mock("./recurring", async original => ({ ...await original<typeof import("./recurring")>(), findDueRecurringMatches: m.due, confirmRecurring: m.confirm }));
vi.mock("./save-chosen-category",()=>({saveChosenCategory:m.createCategory}));
import { handleIncomingMessage } from "./message-handler";
type Mode = "personal" | "business";
const entry = (mode: Mode) => ({ id: `fixture-${mode}`, userId: "fixture-owner", type: "expense", description: `${mode} private entry`, amount: 50, category: "Outros", mode, date: "2026-10-12", source: "web", status: "confirmed", createdAt: "2026-10-12" });
let rows: ReturnType<typeof entry>[];
const reply = () => m.send.mock.calls.map(call => call[1]).join("\n");
const receive = (text: string) => handleIncomingMessage({ from: "5511999990000", text });
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("MULTI_COMPANY_ENABLED", "false"); vi.stubEnv("OPEN_FINANCE_WHATSAPP_ENABLED", "false");
  rows = [entry("personal")];
  m.owner.mockResolvedValue({ id: "fixture-owner", name: "Fixture Owner", phone: "5511999990001", email: "fixture@example.test", plan: "business", status: "active", activeMode: "personal", customCategoriesExpense:["Café 2026"], locale: "pt-BR" });
  m.access.mockResolvedValue("both"); m.send.mockResolvedValue(true); m.pending.mockResolvedValue(null); m.batch.mockResolvedValue(null); m.count.mockResolvedValue(1); m.code.mockResolvedValue("fixture-code");
  m.process.mockResolvedValue({ intent: "finance_delete", confidence: .99, keyword: "private entry" });
  m.find.mockImplementation(async (_owner, mode) => rows.filter(row => !mode || row.mode === mode));
  m.range.mockImplementation(async (_owner, mode) => rows.filter(row => !mode || row.mode === mode));
  m.remove.mockResolvedValue(true); m.update.mockImplementation(async (id, _owner, patch) => ({ ...rows.find(row => row.id === id), ...patch }));
  m.financeCount.mockResolvedValue(2); m.removeAll.mockResolvedValue(2);
  m.balance.mockResolvedValue({ income: 80, expense: 10, balance: 70 }); m.rangeBalance.mockResolvedValue({ income: 80, expense: 10, balance: 70 });
  m.createCategory.mockImplementation(async (_id,name)=>name);
  m.accounts.mockResolvedValue([]); m.due.mockResolvedValue([]); m.confirm.mockResolvedValue(null);
});
afterEach(() => vi.unstubAllEnvs());


const selected=()=>({type:"finance_select",userId:"fixture-owner",mode:"personal",action:"edit",awaitingPatch:true,candidates:[entry("personal")]});
it("offers creation in the category choices without modifying transactions",async()=>{
 await receive("quais categorias?");expect(reply()).toContain("Café 2026");expect(reply()).toContain("Cadastrar nova categoria");expect(reply()).toContain("Outros");expect(m.update).not.toHaveBeenCalled();expect(m.process).not.toHaveBeenCalled();
});
it("creates and applies a new category to only the previously selected transactions",async()=>{
 m.pending.mockResolvedValue(selected());await receive("cadastrar nova categoria");
 expect(m.createCategory).not.toHaveBeenCalled();expect(m.setPending).toHaveBeenLastCalledWith("5511999990000",expect.objectContaining({type:"category_name",mode:"personal",entryType:"expense",candidates:[entry("personal")]}));
 const pending=m.setPending.mock.calls.at(-1)![1];m.pending.mockResolvedValue(pending);await receive("Viagens");
 expect(m.createCategory).toHaveBeenCalledExactlyOnceWith("fixture-owner","Viagens",["expense"]);
 expect(m.update).toHaveBeenCalledExactlyOnceWith("fixture-personal","fixture-owner",{category:"Viagens"},"personal");expect(m.clear).toHaveBeenCalled();expect(reply()).toContain("Aplicada a 1");
});
it("can cancel creation and return to changing the selected transaction",async()=>{
 m.pending.mockResolvedValue({...selected(),type:"category_name",entryType:"expense"});await receive("cancelar");
 expect(m.createCategory).not.toHaveBeenCalled();expect(m.update).not.toHaveBeenCalled();expect(m.setPending).toHaveBeenCalledWith("5511999990000",expect.objectContaining({type:"finance_select",awaitingPatch:true,candidates:[entry("personal")]}));
});
it("does not turn category-list questions or new spending queries into category names",async()=>{
 m.pending.mockResolvedValue({type:"category_name",userId:"fixture-owner",mode:"personal"});await receive("quais categorias");expect(m.createCategory).not.toHaveBeenCalled();expect(m.clear).not.toHaveBeenCalled();
 m.process.mockResolvedValue({intent:"balance_query",confidence:.99});await receive("qual meu saldo");expect(m.clear).toHaveBeenCalled();expect(m.process).toHaveBeenCalled();expect(m.createCategory).not.toHaveBeenCalled();
});
it("selects an existing custom category with digits without editing the amount",async()=>{
 m.pending.mockResolvedValue(selected());await receive("categoria Café 2026");
 expect(m.update).toHaveBeenCalledExactlyOnceWith("fixture-personal","fixture-owner",{category:"Café 2026"},undefined);expect(m.createCategory).not.toHaveBeenCalled();
});
it("keeps Outros selectable for card purchases",async()=>{
 m.pending.mockResolvedValue(selected());await receive("categoria Outros");expect(m.update).toHaveBeenCalledWith("fixture-personal","fixture-owner",{category:"Outros"},undefined);
});
it("rejects creation attached to a transaction outside the participant's current access",async()=>{
 m.access.mockResolvedValue("business");m.pending.mockResolvedValue(selected());await receive("cadastrar categoria Viagens");expect(m.createCategory).not.toHaveBeenCalled();expect(m.update).not.toHaveBeenCalled();
});
it("creates named categories without relying on model classification",async()=>{
 await receive("cadastrar categoria Aulas");expect(m.createCategory).toHaveBeenCalledExactlyOnceWith("fixture-owner","Aulas",["expense","income"]);expect(m.process).not.toHaveBeenCalled();expect(reply()).toContain("plataforma e no WhatsApp");
});
