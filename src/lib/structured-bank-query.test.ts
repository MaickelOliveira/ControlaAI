import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ access: vi.fn(), rpc: vi.fn(), read: vi.fn() }));
vi.mock("./open-finance-access", () => ({ getOpenFinanceAccess: m.access }));
vi.mock("./open-finance-http", () => ({ openFinanceRpc: m.rpc }));
vi.mock("./unified-finances", () => ({ readUnifiedFinances: m.read }));
import { explicitBankQueryPlan, validateBankQuery } from "./bank-query-intent";
import { answerStructuredBankQuery } from "./structured-bank-query";
import { bankMoney } from "./open-finance-display";
import type { AIResult } from "./ai-processor";
const user = { id: "holder", email: "holder@example.test", plan: "business" as const, activeMode: "personal" as const, status: "active" as const };
const overview = { connections: [{ id: "nu", institution_name: "Nubank", status: "active" }], resources: [{ id: "card", connection_id: "nu", resource_type: "card", name: "Platinum", identification_last4: "1234", synced_at: "2026-10-11" }], limits: [{ resource_id: "card", currency: "BRL", available_amount: "1234.56", total_amount: "2000", used_amount: "765.44" }], credit: [], bills: [], sync: [], agenda: { incomplete: false, items: [{ id: "purchase", kind: "installment", resource_id: "card", institution_name: "Nubank", resource_name: "Platinum", description: "Notebook teste", amount: "90.10", currency: "BRL", observed_installments: 12, total_installments: 12, due_date: null, synced_at: "2026-10-11" }] } };
const ai = (bankQuery: unknown, extra = {}) => ({ intent: "bank_query", confidence: .95, bankQuery, ...extra }) as AIResult;
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv("OPEN_FINANCE_WHATSAPP_ENABLED", "true"); m.access.mockResolvedValue({ userId: "holder", mode: "personal", environment: "production" }); m.rpc.mockResolvedValue(overview); });
afterEach(() => vi.unstubAllEnvs());
it.each([{ kind: "invented" }, { kind: "limits", bankName: 42 }, { kind: "loans", last4: "12" }, { kind: "spending", last4: "1234" }, { kind: "balances", category: "Lazer" }, { kind: "installments", category: "Alimentação" }, { kind: "recurring", category: "Serviços" }, { kind: "limits", source: "investment" }, { kind: "limits", bankName: "a".repeat(81) }])("rejects unsupported model arguments without broadening the query: %j", query => {
  expect(validateBankQuery(query)).toBeNull();
});
it("returns only allowed fields; model-supplied totals and tenant identities never enter execution", () => {
  expect(validateBankQuery({ kind: "limits", bankName: " Nubank ", userId: "other", companyId: "other", total: 999999 })).toEqual({ kind: "limits", bankName: "Nubank" });
});
it("executes a semantically interpreted card question against saved values", async () => {
  const response = await answerStructuredBankQuery(user, "personal", "both", ai({ kind: "limits", bankName: "Nubank" }), "2026-10-11");
  expect(response).toContain(bankMoney("1234.56", "BRL")); expect(response).not.toContain("Você gastou"); expect(m.read).not.toHaveBeenCalled();
});
it("includes a fully observed installment without claiming it has been paid", async () => {
  const response = await answerStructuredBankQuery(user, "personal", "both", ai({ kind: "installments" }), "2026-10-11");
  expect(response).toContain("Notebook teste"); expect(response).toContain("Última parcela identificada: 12 de 12"); expect(response).toContain("não confirmam pagamento"); expect(response).not.toContain("quitad"); expect(response).not.toContain("faltam 0");
});
it("keeps unknown currency and payment dates unknown", async () => {
  m.rpc.mockResolvedValue({ ...overview, agenda: { ...overview.agenda, items: [{ ...overview.agenda.items[0], currency: null }] } });
  const response = await answerStructuredBankQuery(user, "personal", "both", ai({ kind: "installments" }), "2026-10-11");
  expect(response).toContain("moeda não informada"); expect(response).not.toContain("R$"); expect(response).toContain("Vencimento não informado");
});
it.each([{ period: { from: "2026-09-01", to: "2026-09-30" } }, { period: { from: "2026-10-08", to: "2026-10-08" } }, { period: "invalid" }, { period: { from: "2026-02-30", to: "2026-03-01" } }, { confidence: .3 }, { mode: "business" }])("does not query storage for unsupported historical positions, bad dates, uncertain intent or denied mode: %j", async extra => {
  const response = await answerStructuredBankQuery(user, "personal", "personal", ai({ kind: "limits" }, extra), "2026-10-11");
  expect(response).toBeTruthy(); expect(m.rpc).not.toHaveBeenCalled();
});
it.each([["balances","450.20"],["loans","1200.10"],["financings","7000.40"],["investments","3100.50"],["bills","230.60"],["limits","1234.56"]])("executes the complete current-position capability matrix: %s",async(kind,amount)=>{
  m.rpc.mockResolvedValue({...overview,
    resources:[...overview.resources,
      {id:"account",connection_id:"nu",resource_type:"account",name:"Conta teste",currency:"BRL",available_amount:"450.20"},
      {id:"loan",connection_id:"nu",resource_type:"loan",name:"Crédito teste"},
      {id:"fin",connection_id:"nu",resource_type:"financing",name:"Financiamento teste"},
      {id:"invest",connection_id:"nu",resource_type:"investment",name:"Aplicação teste",currency:"BRL",net_amount:"3100.50",gross_amount:"3300",valuation_date:"2026-10-11"}],
    credit:[{resource_id:"loan",currency:"BRL",outstanding_amount:"1200.10"},{resource_id:"fin",currency:"BRL",outstanding_amount:"7000.40"}],
    bills:[{resource_id:"card",currency:"BRL",total_amount:"230.60",status:"unknown",due_date:"2026-10-20"}],
  });
  expect(await answerStructuredBankQuery(user,"personal","both",ai({kind,bankName:"Nubank"}),"2026-10-11")).toContain(bankMoney(amount,"BRL"));
});
it("preserves the selected authenticated company and ignores company identities in model output",async()=>{
  m.access.mockResolvedValue({userId:"holder",mode:"business",companyId:"selected-company",companyName:"Empresa teste",environment:"production"});
  const answer=await answerStructuredBankQuery(user,"business","both",ai({kind:"limits",companyId:"other-company"}),"2026-10-11");
  expect(m.rpc.mock.calls[0][0].companyId).toBe("selected-company"); expect(answer).toContain("Empresa teste"); expect(answer).not.toContain("other-company");
});
it("does not discard a due-date period when bank schedules lack dates",async()=>{
  const answer=await answerStructuredBankQuery(user,"personal","both",ai({kind:"installments"},{period:{from:"2026-10-12",to:"2026-10-18"}}),"2026-10-11");
  expect(answer).toContain("sem vencimento"); expect(answer).not.toContain("Notebook teste");
});
it("filters transactions by bank, category and period, leaving unrelated banks and manual records out", async () => {
  m.read.mockResolvedValue({ entries: [
    { id: "nu", mode: "personal", source: "bank", included: true, type: "expense", date: "2026-09-15", category: "Alimentação", description: "Compra teste", amount: 51, bank: { institution_name: "Nubank", resource_type: "card" } },
    { id: "si", mode: "personal", source: "bank", included: true, type: "expense", date: "2026-09-15", category: "Alimentação", description: "Outro banco", amount: 99, bank: { institution_name: "Sicredi", resource_type: "card" } },
    { id: "manual", mode: "personal", source: "whatsapp", included: true, type: "expense", date: "2026-09-15", category: "Alimentação", description: "Manual", amount: 1000 },
  ], bank: { overview, report: { sync_pending: false, missing_dates: 0, last_successful_sync_at: "2026-10-11" } } });
  const response = await answerStructuredBankQuery(user, "personal", "both", ai({ kind: "transactions", bankName: "Nubank", category: "Alimentação" }, { period: { from: "2026-09-01", to: "2026-09-30" } }), "2026-10-11");
  expect(response).toContain(bankMoney("51", "BRL")); expect(response).toContain("Compra teste"); expect(response).not.toContain("Outro banco"); expect(response).not.toContain("Manual"); expect(m.read).toHaveBeenCalledWith(user, "personal", "2026-09-01", "2026-09-30");
});
it("returns an unavailable response rather than an empty bank result on storage failure", async () => {
  m.rpc.mockRejectedValue(Error("private storage detail"));
  const response = await answerStructuredBankQuery(user, "personal", "both", ai({ kind: "installments" }), "2026-10-11");
  expect(response).toContain("Não consegui"); expect(response).not.toContain("private storage detail"); expect(response).not.toContain("Nenhum");
});

it("validates and executes a financing purpose filter instead of broadening it to every debt",async()=>{
 expect(validateBankQuery({kind:"financings",keyword:"carro"})).toEqual({kind:"financings",keyword:"carro"});
 expect(validateBankQuery({kind:"limits",keyword:"carro"})).toBeNull();
 m.rpc.mockResolvedValue({...overview,resources:[{id:"car",connection_id:"nu",resource_type:"financing",name:"Veículos e utilitários"},{id:"house",connection_id:"nu",resource_type:"financing",name:"Imóvel residencial"}],credit:[{resource_id:"car",currency:"BRL",outstanding_amount:"6789.12"},{resource_id:"house",currency:"BRL",outstanding_amount:"44444"}]});
 const response=await answerStructuredBankQuery(user,"personal","both",ai({kind:"financings",keyword:"carro"}),"2026-10-11");
 expect(response).toContain(bankMoney("6789.12","BRL"));expect(response).not.toContain("Imóvel residencial");
});

it("returns one largest account debit using the bank direction, even when excluded from spending totals", async () => {
  m.read.mockResolvedValue({ entries: [
    { id: "one", mode: "personal", source: "bank", included: true, type: "expense", status: "posted", date: "2026-10-09", description: "Compra pequena", amount: 10, category: "Outros", bank: { amount: "10", currency: "BRL", direction: "debit", resource_type: "account", institution_name: "Nubank" } },
    { id: "two", mode: "personal", source: "bank", included: false, type: "expense", status: "posted", date: "2026-10-10", description: "Pagamento de fatura", amount: 90, category: "Transferências e pagamentos", bank: { amount: "90", currency: "BRL", direction: "debit", resource_type: "account", institution_name: "Nubank" } },
    { id: "three", mode: "personal", source: "bank", included: true, type: "income", status: "posted", date: "2026-10-08", description: "Entrada maior", amount: 150, category: "Outros", bank: { amount: "150", currency: "BRL", direction: "credit", resource_type: "account", institution_name: "Nubank" } },
  ], bank: { overview, report: { sync_pending: false, missing_dates: 0, last_successful_sync_at: "2026-10-11" } } });
  const response = await answerStructuredBankQuery(user, "personal", "both", ai({ kind: "transactions", operation: "max", direction: "debit", source: "account" }), "2026-10-11");
  expect(response).toContain("Pagamento de fatura"); expect(response).toContain(bankMoney("90", "BRL"));
  expect(response).not.toContain("Compra pequena"); expect(response).not.toContain("Entrada maior");
  expect(response).toContain("fora dos totais");
});

it("chooses the largest account credit without treating a card refund as bank income", async () => {
  m.read.mockResolvedValue({ entries: [
    { id: "account", mode: "personal", source: "bank", included: true, type: "income", status: "posted", date: "2026-10-09", description: "Depósito recebido", amount: 80, category: "Outros", bank: { amount: "80", currency: "BRL", direction: "credit", resource_type: "account", institution_name: "Nubank" } },
    { id: "card", mode: "personal", source: "bank", included: true, type: "expense", status: "posted", date: "2026-10-10", description: "Estorno do cartão", amount: -120, category: "Outros", bank: { amount: "120", currency: "BRL", direction: "credit", resource_type: "card", institution_name: "Nubank" } },
  ], bank: { overview, report: { sync_pending: false, missing_dates: 0, last_successful_sync_at: "2026-10-11" } } });
  const response = await answerStructuredBankQuery(user, "personal", "both", ai({ kind: "transactions", operation: "max", direction: "credit", source: "account" }), "2026-10-11");
  expect(response).toContain("Depósito recebido"); expect(response).toContain(bankMoney("80", "BRL")); expect(response).not.toContain("Estorno do cartão");
});

it("lists identified bank fees individually without mixing IOF tax or a category-only total", async () => {
  m.read.mockResolvedValue({ entries: [
    { id: "fee", mode: "personal", source: "bank", included: true, type: "expense", status: "posted", date: "2026-10-09", description: "Tarifa de manutenção", amount: 20, category: "Encargos bancários", bank: { amount: "20", currency: "BRL", direction: "debit", resource_type: "account", institution_name: "Nubank", source_category: "BANK_FEES" } },
    { id: "tax", mode: "personal", source: "bank", included: true, type: "expense", status: "posted", date: "2026-10-10", description: "IOF", amount: 5, category: "Encargos bancários", bank: { amount: "5", currency: "BRL", direction: "debit", resource_type: "account", institution_name: "Nubank", source_category: "GOVERNMENT_AND_NON_PROFIT_TAX_PAYMENT" } },
  ], bank: { overview, report: { sync_pending: false, missing_dates: 0, last_successful_sync_at: "2026-10-11" } } });
  const response = await answerStructuredBankQuery(user, "personal", "both", ai({ kind: "transactions", operation: "list", direction: "debit", source: "account", movementClass: "bank_fee" }), "2026-10-11");
  expect(response).toContain("Tarifa de manutenção"); expect(response).toContain(bankMoney("20", "BRL")); expect(response).not.toContain("IOF");
});

it("lists only bills due on the requested date with payment uncertainty", async () => {
  m.rpc.mockResolvedValue({ items: [
    { id: "tomorrow", kind: "bill", institution_name: "Nubank", resource_name: "Gold", description: "Fatura", due_date: "2026-10-12", amount: "75", currency: "BRL", synced_at: "2026-10-11" },
    { id: "later", kind: "bill", institution_name: "Nubank", resource_name: "Gold", description: "Outra fatura", due_date: "2026-10-20", amount: "80", currency: "BRL", synced_at: "2026-10-11" },
    { id: "installment", kind: "installment", institution_name: "Nubank", resource_name: "Gold", description: "Parcela", due_date: "2026-10-12", amount: "10", currency: "BRL", synced_at: "2026-10-11" },
  ], incomplete: false });
  const response = await answerStructuredBankQuery(user, "personal", "both", ai({ kind: "bill_due" }, { period: { from: "2026-10-12", to: "2026-10-12" } }), "2026-10-11");
  expect(response).toContain(bankMoney("75", "BRL")); expect(response).toContain("12/10/2026"); expect(response).not.toContain(bankMoney("80", "BRL")); expect(response).not.toContain("Parcela");
  expect(response).toContain("pagamento não confirmado");
});

it("rejects unsafe or incoherent query-plan combinations", () => {
  expect(validateBankQuery({ kind: "transactions", operation: "erase" })).toBeNull();
  expect(validateBankQuery({ kind: "balances", operation: "max" })).toBeNull();
  expect(validateBankQuery({ kind: "transactions", movementClass: "bank_fee", source: "card" })).toBeNull();
});

it("does not broaden a named-bank request when the model failed to identify the bank", () => {
  expect(explicitBankQueryPlan("Qual foi o maior débito bancário no Banco Aurora?")).toBeNull();
  expect(explicitBankQueryPlan("Qual foi o maior débito bancário do mês?")).toMatchObject({ kind: "transactions", operation: "max", direction: "debit" });
});
