import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ owner: vi.fn(), send: vi.fn(), process: vi.fn(), rpc: vi.fn(), access: vi.fn(), recurring: vi.fn(), due: vi.fn(), confirm: vi.fn(), read: vi.fn() }));
vi.mock("./users", async original => ({ ...await original<typeof import("./users")>(), getUserById: m.owner }));
vi.mock("./wpp-phone-links", () => ({ getUserIdByPhone: vi.fn().mockResolvedValue("holder"), getPhoneAccess: vi.fn().mockResolvedValue("both"), getPhonesForUser: vi.fn().mockResolvedValue([{ phone: "5511999990000", name: "Ana Teste", relation: "Titular" }]) }));
vi.mock("./pending-actions", async original => ({ ...await original<typeof import("./pending-actions")>(), getPendingAction: vi.fn().mockResolvedValue(null) }));
vi.mock("./conversations", async original => ({ ...await original<typeof import("./conversations")>(), addMessage: vi.fn(), getAiPaused: vi.fn().mockResolvedValue(false), getAiHistory: vi.fn().mockResolvedValue([]) }));
vi.mock("./whatsapp", () => ({ sendText: m.send, sendFile: vi.fn() }));
vi.mock("./ai-processor", async original => ({ ...await original<typeof import("./ai-processor")>(), processMessage: m.process }));
vi.mock("./open-finance-access", () => ({ getOpenFinanceAccess: m.access, canEnrollOpenFinance: () => true }));
vi.mock("./open-finance-http", () => ({ openFinanceRpc: m.rpc }));
vi.mock("./recurring", async original => ({ ...await original<typeof import("./recurring")>(), getRecurringByUser: m.recurring, findDueRecurringMatches: m.due, confirmRecurring: m.confirm }));
vi.mock("./accounts", async original => ({ ...await original<typeof import("./accounts")>(), getManualAccountsByUser: vi.fn().mockResolvedValue([]) }));
vi.mock("./unified-finances", () => ({ readUnifiedFinances: m.read }));
import { handleIncomingMessage } from "./message-handler";
import { bankMoney } from "./open-finance-display";
import {getExplicitRecurringQueryResult} from "./ai-processor";
const user = { id: "holder", name: "Ana Teste", email: "holder@example.test", plan: "business", status: "active", activeMode: "personal", locale: "pt-BR" };
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("MULTI_COMPANY_ENABLED", "false"); vi.stubEnv("OPEN_FINANCE_WHATSAPP_ENABLED", "true");
  m.owner.mockResolvedValue(user); m.send.mockResolvedValue(true); m.process.mockRejectedValue(Error("Generic classifier must not handle a bank position"));
  m.recurring.mockResolvedValue([]); m.due.mockResolvedValue([{ id: "due-rent", description: "Aluguel", nextDueDate: "2026-10-01" }]);
  m.access.mockResolvedValue({ userId: "holder", mode: "personal", environment: "production" });
  m.rpc.mockResolvedValue({ connections: [{ id: "nu", institution_name: "Nubank", status: "active" }], resources: [{ id: "loan", connection_id: "nu", resource_type: "loan", name: "Crédito pessoal", synced_at: "2026-10-11" }, { id: "card", connection_id: "nu", resource_type: "card", name: "Platinum", synced_at: "2026-10-11" }], credit: [{ resource_id: "loan", currency: "BRL", outstanding_amount: "1200.10", contract_amount: "5000" }], limits: [{ resource_id: "card", line_name: "Crédito à vista", currency: "BRL", available_amount: "1245.92", total_amount: "2000", used_amount: "754.08" }], bills: [], sync: [] });
});
it("interprets a new phrasing with AI then reads the correct bank product instead of generic expenses", async () => {
  m.process.mockResolvedValue({ intent: "bank_query", confidence: .96, bankQuery: { kind: "limits", bankName: "Nubank" } });
  await handleIncomingMessage({ from: "5511999990000", text: "Rita, quanto ainda posso comprar usando meu Nubank?" });
  const response = m.send.mock.calls.map(call => call[1]).join("\n");
  expect(response).toContain(bankMoney("1245.92", "BRL")); expect(response).toContain("*Rita*"); expect(m.process).toHaveBeenCalledOnce(); expect(m.confirm).not.toHaveBeenCalled();
});
it("never confirms a due manual payment while answering an AI-interpreted bank query", async () => {
  m.process.mockResolvedValue({ intent: "bank_query", confidence: .96, bankQuery: { kind: "spending", keyword: "aluguel" } });
  await handleIncomingMessage({ from: "5511999990000", text: "Quanto paguei o aluguel no banco?" });
  expect(m.due).not.toHaveBeenCalled(); expect(m.confirm).not.toHaveBeenCalled();
});
it("keeps ordinary spending questions read-only as well", async () => {
  m.process.mockResolvedValue({ intent: "finance_query", confidence: .96, keyword: "aluguel" });
  m.read.mockResolvedValue({ entries: [], bank: { overview: { connections: [{ institution_name: "Nubank" }] }, report: { sync_pending: false, missing_dates: 0, last_successful_sync_at: "2026-10-11" } } });
  await handleIncomingMessage({ from: "5511999990000", text: "Quanto paguei o aluguel?" });
  expect(m.due).not.toHaveBeenCalled(); expect(m.confirm).not.toHaveBeenCalled(); expect(m.send.mock.calls.map(call=>call[1]).join("\n")).toContain("Estabelecimento/busca: aluguel");
});
it("includes bank installments when the manual recurring list is empty, retaining unknown currency", async () => {
  m.process.mockResolvedValue({ intent: "recurring_query", confidence: .95 });
  m.rpc.mockResolvedValue({ incomplete: false, items: [{ id: "parcel", kind: "installment", resource_id: "card", description: "Compra teste", institution_name: "Nubank", resource_name: "Platinum", amount: "90.10", currency: null, due_date: null, synced_at: "2026-10-11", total_installments: 12, observed_installments: 12 }] });
  await handleIncomingMessage({ from: "5511999990000", text: "quanto tenho de parcelados" });
  const response = m.send.mock.calls.map(call => call[1]).join("\n");
  expect(response).toContain("Compra teste"); expect(response).toContain("12/12"); expect(response).toContain("moeda não informada"); expect(response).not.toContain("Nenhum lançamento recorrente ou parcelado ativo");
  expect(m.send.mock.calls.every(call => call[2]?.privateFinancial)).toBe(true);
});
afterEach(() => vi.unstubAllEnvs());
it("answers the exact reported parcelados phrase with manual and bank installments only",async()=>{
 m.process.mockImplementation(async(message:string)=>getExplicitRecurringQueryResult(message));
 const manual={id:"fixture-manual",description:"Parcela manual fictícia",type:"expense",amount:20,category:"Outros",recurrenceType:"installment",totalInstallments:10,paidInstallments:2,repeatUnit:"monthly",nextDueDate:"2026-11-10",status:"active",mode:"personal"};
 m.recurring.mockResolvedValue([manual,{...manual,id:"subscription",description:"Assinatura manual fictícia",recurrenceType:"recurring"}]);
 m.rpc.mockResolvedValue({incomplete:false,items:[{id:"fixture-bank",kind:"installment",resource_id:"card",description:"Parcela bancária fictícia",institution_name:"Banco fictício",resource_name:"Gold",amount:"49.90",currency:"BRL",due_date:null,synced_at:"2026-10-11",total_installments:12,observed_installments:2},{id:"subscription",kind:"recurring",description:"Assinatura bancária fictícia",institution_name:"Banco fictício",resource_name:"Gold",amount:"25",currency:"BRL",due_date:"2026-11-10",synced_at:"2026-10-11"}]});
 await handleIncomingMessage({from:"5511999990000",text:"o que tenho de parcelados"});
 const response=m.send.mock.calls.map(call=>call[1]).join("\n");
 expect(response).toContain("Parcela manual fictícia");expect(response).toContain("Parcela bancária fictícia");expect(response).not.toContain("Assinatura manual fictícia");expect(response).not.toContain("Assinatura bancária fictícia");expect(m.confirm).not.toHaveBeenCalled();
});
it("does not count undated installments in a dated subscription-only query",async()=>{
 m.process.mockResolvedValue({intent:"recurring_query",confidence:.95,period:{from:"2026-11-01",to:"2026-11-30"}});
 m.rpc.mockResolvedValue({incomplete:false,items:[{id:"undated",kind:"installment",description:"Parcela não solicitada",institution_name:"Banco fictício",resource_name:"Gold",amount:"40",currency:"BRL",due_date:null,synced_at:"2026-10-11"},{id:"subscription",kind:"recurring",description:"Assinatura solicitada",institution_name:"Banco fictício",resource_name:"Gold",amount:"25",currency:"BRL",due_date:"2026-11-10",synced_at:"2026-10-11"}]});
 await handleIncomingMessage({from:"5511999990000",text:"quais assinaturas tenho em novembro"});
 const response=m.send.mock.calls.map(call=>call[1]).join("\n");
 expect(response).toContain("Assinatura solicitada");expect(response).not.toContain("Parcela não solicitada");expect(response).not.toContain("sem vencimento informado ficaram fora");
});
it.each([["zelo quanto eu tenho de emprestimo?", "1200.10"], ["quanto eu tenho de credito disponivel no cartao nubank", "1245.92"]])("handles the real reported phrase through the complete bot without contacting a model: %s", async (text, amount) => {
  await handleIncomingMessage({ from: "5511999990000", text });
  const response = m.send.mock.calls.map(call => call[1]).join("\n");
  expect(response).toContain(bankMoney(amount, "BRL")); expect(response).toContain("*Ana*"); expect(response).toContain("*Rita*"); expect(response).toContain("Nubank"); expect(response).not.toContain("Você gastou"); expect(m.process).not.toHaveBeenCalled();
});

it("answers the remaining car financing through saved debt rather than the monthly payable forecast",async()=>{
 m.rpc.mockResolvedValue({connections:[{id:"si",institution_name:"Sicredi",status:"active"}],resources:[{id:"car",connection_id:"si",resource_type:"financing",name:"VEICULOS E UTILITARIOS LEVES - REVENDAS",synced_at:"2026-10-11"},{id:"house",connection_id:"si",resource_type:"financing",name:"Habitação"}],credit:[{resource_id:"car",currency:"BRL",outstanding_amount:"7654.32",contract_amount:"18000",next_installment_amount:"450"},{resource_id:"house",currency:"BRL",outstanding_amount:"55555"}],limits:[],bills:[],sync:[]});
 await handleIncomingMessage({from:"5511999990000",text:"quanto falta pra min pagar do carro"});
 const response=m.send.mock.calls.map(call=>call[1]).join("\n");
 expect(response).toContain(bankMoney("7654.32","BRL")); expect(response).toContain("Saldo devedor"); expect(response).not.toContain("Habitação"); expect(response).not.toContain("Previsão para"); expect(m.process).not.toHaveBeenCalled(); expect(m.confirm).not.toHaveBeenCalled();
});
