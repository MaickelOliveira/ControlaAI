import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ owner: vi.fn(), userUpdate: vi.fn(), send: vi.fn(), process: vi.fn(), access: vi.fn(), find: vi.fn(), range: vi.fn(), remove: vi.fn(), update: vi.fn(), pending: vi.fn(), clear: vi.fn(), setPending: vi.fn(), batch: vi.fn(), code: vi.fn(), count: vi.fn(), financeCount: vi.fn(), removeAll: vi.fn(), balance: vi.fn(), rangeBalance: vi.fn(), accounts: vi.fn(), due: vi.fn(), confirm: vi.fn(), add: vi.fn(), addBatch: vi.fn(), accountByName: vi.fn(), financePending: vi.fn() }));
const vehicle = vi.hoisted(() => ({ list: vi.fn(), addExpense: vi.fn(), linkFinance: vi.fn() }));
vi.mock("./vehicles", async original => ({ ...await original<typeof import("./vehicles")>(), getVehiclesByUser: vehicle.list, addVehicleExpense: vehicle.addExpense, setExpenseFinanceId: vehicle.linkFinance }));
const tasks = vi.hoisted(() => ({ pending: vi.fn(), update: vi.fn() }));
vi.mock("./tasks", async original => ({ ...await original<typeof import("./tasks")>(), getPendingTasks: tasks.pending, updateTask: tasks.update }));
vi.mock("./users", async original => ({ ...await original<typeof import("./users")>(), getUserById: m.owner, updateUser: m.userUpdate, generateWppVerifyCode: m.code }));
vi.mock("./wpp-phone-links", () => ({ getUserIdByPhone: async () => "fixture-owner", getPhoneAccess: m.access, getPhonesForUser: async () => [{ userId: "fixture-owner", phone: "5511999990000", name: "Fixture", relation: "Titular" }, { userId: "fixture-owner", phone: "5511999990002", name: "Ana", relation: "Equipe" }], countPhonesForUser: m.count, findPhoneByName: async () => "5511999990002", findPhoneByRelation: async () => null }));
vi.mock("./pending-actions", async original => ({ ...await original<typeof import("./pending-actions")>(), getPendingAction: m.pending, clearPendingAction: m.clear, setPendingAction: m.setPending }));
vi.mock("./conversations", async original => ({ ...await original<typeof import("./conversations")>(), addMessage: vi.fn(), getAiPaused: async () => false, getAiHistory: async () => [], getLastFinanceBatch: m.batch, setLastFinanceBatch: vi.fn() }));
vi.mock("./whatsapp", () => ({ sendText: m.send, sendFile: vi.fn() }));
vi.mock("./whatsapp-config", () => ({ getConfig: async () => ({}) }));
vi.mock("./ai-processor", async original => {
  const actual = await original<typeof import("./ai-processor")>();
  return { ...actual, processMessage: (text: string) => /^(?:Caio,|Quem registrou)/i.test(text)
    ? actual.processMessage(text)
    : actual.getExplicitPendingFinanceRegisterResult(text, new Date(2026, 10, 14, 12)) ?? m.process(text) };
});
vi.mock("./finances", async original => ({ ...await original<typeof import("./finances")>(), findFinanceByDescription: m.find, getFinancesInRange: m.range, getTransactionsInRange: m.range, getKeywordFinances: m.range, deleteFinance: m.remove, updateFinance: m.update, countFinances: m.financeCount, deleteAllFinances: m.removeAll, getBalance: m.balance, getBalanceInRange: m.rangeBalance, addFinance: m.add, addFinances: m.addBatch, getPendingFinances: m.financePending }));
vi.mock("./accounts", async original => ({ ...await original<typeof import("./accounts")>(), getManualAccountsByUser: m.accounts, findAccountByName: m.accountByName }));
vi.mock("./recurring", async original => ({ ...await original<typeof import("./recurring")>(), findDueRecurringMatches: m.due, confirmRecurring: m.confirm, getRecurringByUser: async () => [] }));
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
  m.add.mockImplementation(async input => ({ ...input, id: "new-finance" }));
  m.addBatch.mockImplementation(async inputs => inputs.map((input: object, index: number) => ({ ...input, id: `new-finance-${index}` })));
  m.accountByName.mockResolvedValue([]); m.financePending.mockResolvedValue([]);
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
it("changes a single category edit only when the stated date and amount match", async () => {
  m.access.mockResolvedValue("personal");
  rows = [{ ...entry("personal"), description: "TESTE AUDITORIA", amount: 1, date: "2026-10-15" }];
  m.process.mockResolvedValue({ intent: "finance_edit", confidence: .99, keyword: "TESTE AUDITORIA de R$ 1,00 registrada em 15/10", finance: { category: "Serviços" } });
  m.find.mockImplementation(async (_owner, _mode, keyword) => keyword === "TESTE AUDITORIA" ? rows : []);
  await receive("Altere a categoria da despesa TESTE AUDITORIA de R$ 1,00 registrada em 15/10 para Serviços.");
  expect(m.find).toHaveBeenCalledWith("fixture-owner", "personal", "TESTE AUDITORIA");
  expect(m.update).toHaveBeenCalledExactlyOnceWith("fixture-personal", "fixture-owner", { category: "Serviços" }, "personal");
  expect(m.setPending).not.toHaveBeenCalled();
  await receive("Altere a categoria da despesa TESTE AUDITORIA de R$ 9,00 registrada em 15/10 para Serviços.");
  expect(m.update).toHaveBeenCalledOnce();
  expect(reply()).toContain("Não encontrei um lançamento com os dados informados.");
});

const cash = { id: "business-cash", name: "Dinheiro", mode: "business", type: "bank", isDefault: true };
const receivables = "Preciso colocar na conta empresarial\nPagamentos a cair\nCliente Alfa valor 348,21 pagamento dia 11/11\nCliente Beta valor 1.664,47 pagamento dia 20/11\nCliente Gama valor 45,00 pagamento dia 03/12";

it("registers the business receivables together with the only available account and keeps the dates pending", async () => {
  m.accounts.mockResolvedValue([cash]);
  await receive(receivables);
  expect(m.setPending).not.toHaveBeenCalled();
  expect(m.process).not.toHaveBeenCalled();
  expect(m.addBatch).toHaveBeenCalledExactlyOnceWith([
    expect.objectContaining({ accountId: cash.id, mode: "business", type: "income", status: "pending", autoPost: false, amount: 348.21, date: "2026-11-11" }),
    expect.objectContaining({ accountId: cash.id, amount: 1664.47, date: "2026-11-20" }),
    expect.objectContaining({ accountId: cash.id, amount: 45, date: "2026-12-03" }),
  ]);
  expect(reply()).toContain("3 lançamentos registrados");
  expect(reply()).toContain("Dinheiro");
});

it("waits for a choice between two business accounts before writing any of a batch", async () => {
  m.accounts.mockResolvedValue([cash, { ...cash, id: "inter", name: "Inter" }]);
  await receive(receivables);
  expect(m.addBatch).not.toHaveBeenCalled();
  expect(m.setPending).toHaveBeenCalledWith("5511999990000", expect.objectContaining({ type: "account_selection", mode: "business" }));
  expect(reply()).toContain("Qual conta deseja usar?");
});

it("does not substitute the sole account when an expressly named account is missing", async () => {
  m.accounts.mockResolvedValue([cash]);
  m.process.mockResolvedValue({ intent: "finance_register", confidence: 1,
    finance: { type: "expense", description: "Material", amount: 50, accountHint: "Inter" } });
  await receive("Registre 50 reais de material na conta Inter");
  expect(m.add).not.toHaveBeenCalled();
  expect(reply()).toContain("Não encontrei a conta *Inter*");
  expect(reply()).not.toContain("Qual conta deseja usar?");
});

it("asks for a number when more than one pending payment matches the request", async () => {
  const first = { ...entry("business"), status: "pending", description: "Aluguel" };
  m.financePending.mockResolvedValue([first, { ...first, id: "next", date: "2026-11-12" }]);
  m.process.mockResolvedValue({ intent: "finance_confirm_pending", confidence: 1, keyword: "aluguel" });
  await receive("Já paguei o aluguel que estava pendente");
  expect(m.update).not.toHaveBeenCalled();
  expect(m.setPending).toHaveBeenCalledWith("5511999990000", expect.objectContaining({ type: "finance_select", patch: { status: "posted" } }));
});

it("uses the only task directly and resumes the original change by number when tasks share a name", async () => {
  const task = { id: "task-a", title: "Conferir notas", mode: "business" };
  const other = { ...task, id: "task-b" };
  m.process.mockResolvedValue({ intent: "task_update", confidence: 1, task: { newPriority: "high" } });
  tasks.pending.mockResolvedValue([task]);
  tasks.update.mockResolvedValue(task);
  await receive("Mude a prioridade da tarefa para alta");
  expect(tasks.update).toHaveBeenCalledExactlyOnceWith(task.id, "fixture-owner", expect.objectContaining({ priority: "high" }));
  expect(m.setPending).not.toHaveBeenCalled();
  tasks.update.mockClear();
  tasks.pending.mockResolvedValue([task, other]);
  await receive("Mude a prioridade da tarefa para alta");
  expect(tasks.update).not.toHaveBeenCalled();
  const draft = m.setPending.mock.calls.at(-1)?.[1];
  expect(draft).toMatchObject({ type: "record_selection", candidates: [{ id: task.id }, { id: other.id }] });
  m.pending.mockResolvedValue(draft);
  await receive("Conferir notas");
  expect(tasks.update).not.toHaveBeenCalled();
  await receive("2");
  expect(tasks.update).toHaveBeenCalledExactlyOnceWith(other.id, "fixture-owner", expect.objectContaining({ priority: "high" }));
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
it("shows personal data without switching modes when the model misreads a scoped request", async () => {
  m.access.mockResolvedValue("both");
  m.process.mockResolvedValue({ intent: "mode_switch", confidence: .99, mode: "personal" });
  await receive("Mostre somente dados do modo Pessoal; não acesse a empresa.");
  expect(m.userUpdate).not.toHaveBeenCalled();
  expect(m.rangeBalance).toHaveBeenCalledExactlyOnceWith("fixture-owner", "personal", expect.any(String), expect.any(String));
  expect(reply()).toContain("*Pessoal*");
  expect(reply()).not.toContain("*Empresa*");
});
it("does not include business data in a personal-only financial overview", async () => {
  m.access.mockResolvedValue("both");
  m.process.mockResolvedValue({ intent: "finance_query", confidence: .99, mode: "personal" });
  await receive("Mostre o resumo financeiro do modo Pessoal.");
  expect(m.rangeBalance).toHaveBeenCalledExactlyOnceWith("fixture-owner", "personal", expect.any(String), expect.any(String));
  expect(reply()).not.toContain("*Empresa*");
});


it("returns the registered author when the participant asks about a recorded expense", async () => {
  m.range.mockResolvedValueOnce([
    { ...entry("business"), source: "whatsapp", registeredBy: "11999990002", description: "Combustível", status: "posted" },
  ]);
  await receive("Quem registrou a despesa de combustível em outubro de 2026?");
  expect(reply()).toContain("Registrado por Ana");
  expect(reply()).not.toContain("5511999990002");
});

it("registers the advertised fuel example and reads the saved volume, odometer and value back in WhatsApp", async () => {
  const onix = { id: "onix", brand: "Chevrolet", model: "Onix", year: 2020, plate: "", currentKm: 40000, mode: "business", expenses: [] as Array<Record<string, unknown>> };
  vehicle.list.mockResolvedValue([onix]);
  vehicle.addExpense.mockImplementation(async (_id, _owner, expense) => {
    onix.expenses.push({ id: "fill-up", ...expense });
    return onix;
  });
  await receive("Caio, abasteci o Onix com 30 litros por R$ 180. O painel marca 42 mil km.");
  expect(vehicle.addExpense).toHaveBeenCalledExactlyOnceWith("onix", "fixture-owner", expect.objectContaining({
    amount: 180, liters: 30, km: 42000, type: "fuel",
  }));
  expect(vehicle.linkFinance).toHaveBeenCalledWith("onix", "fill-up", "new-finance");
  expect(reply()).toContain("30 litros · 42.000 km");
  m.send.mockClear();
  await receive("Caio, qual foi o último abastecimento do Onix?");
  expect(reply()).toContain("R$ 180,00 · 30 litros · 42.000 km");
  expect(vehicle.addExpense).toHaveBeenCalledTimes(1);
});

it("does not attribute a named fuel expense to a different vehicle even when there is only one", async () => {
  vehicle.list.mockResolvedValue([{ id: "gol", brand: "Volkswagen", model: "Gol", year: 2020, plate: "", mode: "business", expenses: [] }]);
  await receive("Caio, abasteci o Onix com 30 litros por R$ 180. O painel marca 42 mil km.");
  expect(vehicle.addExpense).not.toHaveBeenCalled();
  expect(m.add).not.toHaveBeenCalled();
  expect(reply()).toMatch(/Não encontrei .*onix/i);
});


it("names the author of a specific expense in the answer to a spending question", async () => {
  m.process.mockResolvedValue({ intent: "finance_query", confidence: 1, keyword: "Combustível" });
  m.range.mockResolvedValueOnce([
    { ...entry("business"), source: "whatsapp", registeredBy: "5511999990002", description: "Combustível", status: "posted" },
  ]);
  await receive("Quanto gastei com combustível?");
  expect(reply()).toContain("R$ 50,00");
  expect(reply()).toContain("Registrado por Ana");
});
