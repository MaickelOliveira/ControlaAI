import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ owner: vi.fn(), send: vi.fn(), process: vi.fn(), rpc: vi.fn(), access: vi.fn(), accounts: vi.fn(), recurring: vi.fn(), due: vi.fn(), confirm: vi.fn(), read: vi.fn(), imported: vi.fn(), finances: vi.fn(), pending:vi.fn(), setPending:vi.fn(), clearPending:vi.fn() }));
vi.mock("./users", async original => ({ ...await original<typeof import("./users")>(), getUserById: m.owner }));
vi.mock("./wpp-phone-links", () => ({ getUserIdByPhone: vi.fn().mockResolvedValue("holder"), getPhoneAccess: vi.fn().mockResolvedValue("both"), getPhonesForUser: vi.fn().mockResolvedValue([{ phone: "5511999990000", name: "Ana Teste", relation: "Titular" }]) }));
vi.mock("./pending-actions", async original => ({ ...await original<typeof import("./pending-actions")>(), getPendingAction:m.pending,setPendingAction:m.setPending,clearPendingAction:m.clearPending }));
vi.mock("./conversations", async original => ({ ...await original<typeof import("./conversations")>(), addMessage: vi.fn(), getAiPaused: vi.fn().mockResolvedValue(false), getAiHistory: vi.fn().mockResolvedValue([]) }));
vi.mock("./whatsapp", () => ({ sendText: m.send, sendFile: vi.fn() }));
vi.mock("./ai-processor", async original => ({ ...await original<typeof import("./ai-processor")>(), processMessage: m.process }));
vi.mock("./open-finance-access", () => ({ getOpenFinanceAccess: m.access, canEnrollOpenFinance: () => true }));
vi.mock("./open-finance-http", () => ({ openFinanceRpc: m.rpc }));
vi.mock("./recurring", async original => ({ ...await original<typeof import("./recurring")>(), getRecurringByUser: m.recurring, findDueRecurringMatches: m.due, confirmRecurring: m.confirm }));
vi.mock("./accounts", async original => ({ ...await original<typeof import("./accounts")>(), getManualAccountsByUser: m.accounts }));
vi.mock("./finances", async original => ({ ...await original<typeof import("./finances")>(), getImportedInstallmentStatuses: m.imported, getFinancesInRangeStrict: m.finances }));
vi.mock("./unified-finances", () => ({ readUnifiedFinances: m.read }));
import { handleIncomingMessage } from "./message-handler";
import { bankMoney } from "./open-finance-display";
import { todayStrBR } from "./date-br";
import {getExplicitRecurringQueryResult} from "./ai-processor";
const user = { id: "holder", name: "Ana Teste", email: "holder@example.test", plan: "business", status: "active", activeMode: "personal", locale: "pt-BR" };
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("MULTI_COMPANY_ENABLED", "false"); vi.stubEnv("OPEN_FINANCE_WHATSAPP_ENABLED", "true");
  m.owner.mockResolvedValue(user); m.send.mockResolvedValue(true); m.process.mockRejectedValue(Error("Generic classifier must not handle a bank position"));
  m.recurring.mockResolvedValue([]); m.due.mockResolvedValue([{ id: "due-rent", description: "Aluguel", nextDueDate: "2026-10-01" }]);
  m.imported.mockResolvedValue([]);
  m.pending.mockResolvedValue(null);
  m.finances.mockResolvedValue([]);
  m.access.mockResolvedValue({ userId: "holder", mode: "personal", environment: "production" });
  m.accounts.mockResolvedValue([]);
  m.rpc.mockResolvedValue({ connections: [{ id: "nu", institution_name: "Nubank", status: "active" }], resources: [{ id: "loan", connection_id: "nu", resource_type: "loan", name: "Crédito pessoal", synced_at: "2026-10-11" }, { id: "card", connection_id: "nu", resource_type: "card", name: "Platinum", synced_at: "2026-10-11" }], credit: [{ resource_id: "loan", currency: "BRL", outstanding_amount: "1200.10", contract_amount: "5000" }], limits: [{ resource_id: "card", line_name: "Crédito à vista", currency: "BRL", available_amount: "1245.92", total_amount: "2000", used_amount: "754.08" }], bills: [], sync: [] });
});
it("lets Rita confirm exactly one ambiguous bank debit without registering, editing or deleting a purchase",async()=>{
 const day="2026-11-13",id="00000000-0000-4000-8000-000000000001";
 const row={id,date:day,amount:"2801.72",currency:"BRL",resource_type:"account",direction:"debit",kind:"account_debits",institution_name:"Banco Santander Pessoa Física",description:"DÉBITO AUTOMÁTICO"};
 m.rpc.mockImplementation(async(_scope,name)=>name==="zelo_of_set_movement_category"?true:{movements:[
  row,{...row,id:"00000000-0000-4000-8000-000000000002",resource_type:"card",direction:"debit",description:"Compra legítima"},
  {...row,id:"00000000-0000-4000-8000-000000000003",institution_name:"Nubank",description:"Outro banco"},
 ],next:null});
 await handleIncomingMessage({from:"5511999990000",text:"Rita, marque o pagamento de R$ 2.801,72 de 13/11/2026 no Santander como pagamento de fatura."});
 const draft=m.setPending.mock.calls[0]?.[1];
 expect(draft).toMatchObject({type:"finance_bill_payment",mode:"personal",day,amount:2801.72,movementIds:[id]});
 const reply=m.send.mock.calls.map(call=>call[1]).join("\n");
 expect(reply).toContain("DÉBITO AUTOMÁTICO");
 expect(reply).not.toContain("Compra legítima");
 expect(reply).not.toContain("Outro banco");
 expect(m.rpc.mock.calls.some(call=>call[1]==="zelo_of_set_movement_category")).toBe(false);
 m.pending.mockResolvedValue(draft);
 await handleIncomingMessage({from:"5511999990000",text:"1"});
 expect(m.rpc).toHaveBeenLastCalledWith(expect.objectContaining({userId:"holder",mode:"personal"}),"zelo_of_set_movement_category",{p_movement:id,p_category:"Pagamento de fatura"});
 expect(m.send.mock.calls.at(-1)?.[1]).toContain("continua no extrato e fica fora das despesas");
 expect(m.send.mock.calls.every(call=>call[2]?.privateFinancial)).toBe(true);
 expect(m.process).not.toHaveBeenCalled();
 expect(m.confirm).not.toHaveBeenCalled();
});
it("keeps a manually corrected payment out of expenses but still lists it for a WhatsApp audit",async()=>{
 const date=todayStrBR();
 m.read.mockResolvedValue({entries:[{id:"bank:payment",mode:"personal",source:"bank",status:"posted",type:"expense",date,category:"Pagamento de fatura",included:false,amount:100,description:"DÉBITO AUTOMÁTICO",bank:{resource_type:"account",direction:"debit",user_category:"Pagamento de fatura",description:"DÉBITO AUTOMÁTICO",amount:"100",currency:"BRL"}}],bank:{overview:{connections:[{}]},report:{sync_pending:false,missing_dates:0}}});
 await handleIncomingMessage({from:"5511999990000",text:"Mostre pagamentos de fatura fora dos gastos."});
 expect(m.send.mock.calls.map(call=>call[1]).join("\n")).toContain("DÉBITO AUTOMÁTICO");
});
function planningFixture(incomplete=false){
  vi.useFakeTimers({toFake:["Date"]});
  vi.setSystemTime(new Date("2026-11-13T15:00:00Z"));
  m.rpc.mockImplementation(async (_scope, name) => {
    if(name==="zelo_of_overview")return {
      connections:[{id:"nu",institution_name:"Nubank",status:"active"},{id:"san",institution_name:"Santander",status:"active"}],
      resources:[
        {id:"nu-card",connection_id:"nu",resource_type:"card",name:"Platinum",identification_last4:"1234",currency:"BRL"},
        {id:"san-card",connection_id:"san",resource_type:"card",name:"Free Mastercard",identification_last4:"5678",currency:"BRL"},
        {id:"loan",connection_id:"nu",resource_type:"loan",name:"Crédito pessoal"},
      ],
      credit:[{resource_id:"loan",currency:"BRL",outstanding_amount:"1000",next_installment_amount:"300",due_date:"2027-01-20",total_installments:3,first_due_date:"2026-11-20",periodicity:"MENSAL"}],
      agenda:{items:[{id:"subscription",kind:"recurring",resource_id:"nu-card",institution_name:"Nubank",resource_name:"Platinum",description:"Netflix",due_date:"2026-12-05",amount:"20",currency:"BRL"}],incomplete},
      bills:[],limits:[],sync:[],
    };
    if(name==="zelo_of_installment_anchors")return {incomplete,items:[
      {id:"desk",resource_id:"nu-card",description:"Mesa",institution_name:"Nubank",resource_name:"Platinum",amount:"100",currency:"BRL",bill_month:"2026-11",synced_at:"2026-11-12",observed_installments:1,total_installments:3},
      {id:"books",resource_id:"san-card",description:"Livraria",institution_name:"Santander",resource_name:"Free Mastercard",amount:"50",currency:"BRL",bill_month:"2026-11",synced_at:"2026-11-12",observed_installments:2,total_installments:3},
    ]};
    if(name==="zelo_of_report"||name==="zelo_of_ledger_report")return {movements:[
      {id:"bill",resource_id:"cash",resource_type:"account",institution_name:"Nubank",description:"Pagamento de fatura",amount:"100",currency:"BRL",date:"2026-12-03",direction:"debit",classification:"bill_payment",kind:"excluded"},
    ],next:null,sync_pending:incomplete};
    return {payments:[],plans:[],progress:[]};
  });
}
it("answers the reported WhatsApp prompt with the Finanças forecast and excludes bill payments",async()=>{
  planningFixture();
  try{
    await handleIncomingMessage({from:"5511999990000",text:"zelo quanto tenho pra pagar mes que vem?"});
    const reply=m.send.mock.calls.map(call=>call[1]).join("\n");
    expect(reply).toContain("01/12/2026 a 31/12/2026");
    expect(reply).toContain(`A pagar (previsto): ${bankMoney(470,"BRL")}`);
    expect(reply).toContain(`Registradas: ${bankMoney(0,"BRL")}`);
    expect(reply).toContain("Empréstimos");
    expect(m.access.mock.calls.every(call=>call[1]==="personal")).toBe(true);
    expect(m.process).not.toHaveBeenCalled();
    expect(m.confirm).not.toHaveBeenCalled();
  }finally{vi.useRealTimers();}
});
it.each([
 ["O que tenho parcelado em todos os cartos?",true],
 ["Quais compras parceladas tenho no cartão do Nubank mês que vem?",false],
 ["O que tenho parcelado no cartão Nubank?",false],
 ["O que tenho parcelado só no Nubank?",false],
 ["O que tenho parcelado no cartão final 1234?",false],
])("lists purchases without losing the card scope for %s",async(text,allCards)=>{
  planningFixture();
  try{
    await handleIncomingMessage({from:"5511999990000",text});
    const reply=m.send.mock.calls.map(call=>call[1]).join("\n");
    expect(reply).toContain("Mesa");
    expect(reply.includes("Livraria")).toBe(allCards);
    expect(reply).not.toContain("Netflix");
    expect(m.process).not.toHaveBeenCalled();
  }finally{vi.useRealTimers();}
});
it("does not turn a bank read error into zero upcoming expenses",async()=>{
  planningFixture();
  m.rpc.mockRejectedValue(Error("database unavailable"));
  try{
    await handleIncomingMessage({from:"5511999990000",text:"quanto vou pagar no mês seguinte?"});
    const reply=m.send.mock.calls.map(call=>call[1]).join("\n");
    expect(reply).toContain("Não consegui conferir");
    expect(reply).not.toContain(bankMoney(0,"BRL"));
  }finally{vi.useRealTimers();}
});
it("labels the result partial when a bank is still syncing",async()=>{
  planningFixture(true);
  try{
    await handleIncomingMessage({from:"5511999990000",text:"Quanto vou pagar no próximo mês?"});
    const reply=m.send.mock.calls.map(call=>call[1]).join("\n");
    expect(reply).toContain(bankMoney(470,"BRL"));
    expect(reply).toContain("Total com os valores disponíveis");
    expect(reply).toContain("A atualização dos bancos está incompleta");
  }finally{vi.useRealTimers();}
});
it("recognizes recurring questions addressed directly to Rita",()=>{
  expect(getExplicitRecurringQueryResult("Rita, quais são minhas assinaturas mês que vem?",new Date(2026,10,13,12)))
    .toMatchObject({intent:"recurring_query",period:{from:"2026-12-01",to:"2026-12-31"}});
});
it("answers the exact subscriptions-versus-installments request in short, separate groups",async()=>{
  const today=todayStrBR();
  const tomorrow=new Date(Date.parse(`${today}T12:00:00Z`)+86400000).toISOString().slice(0,10);
  m.recurring.mockResolvedValue([
    {description:"Spotify",category:"Assinaturas",recurrenceType:"recurring",type:"expense",amount:20,nextDueDate:tomorrow},
    {description:"Fogão",category:"Casa",recurrenceType:"installment",type:"expense",amount:80,nextDueDate:tomorrow},
    {description:"Aluguel",category:"Moradia",recurrenceType:"recurring",type:"expense",amount:100,nextDueDate:tomorrow},
  ]);
  m.rpc.mockResolvedValue({items:[
    {id:"subscription",kind:"recurring",institution_name:"Nubank",resource_name:"Gold",description:"Netflix",due_date:tomorrow,amount:"35",currency:"BRL",synced_at:today},
    {id:"purchase",kind:"installment",institution_name:"Nubank",resource_name:"Gold",description:"Loja de móveis",due_date:null,amount:"50",currency:"BRL",synced_at:today,observed_installments:2,total_installments:6},
    {id:"fee",kind:"installment",institution_name:"Nubank",resource_name:"Gold",description:"ANUIDADE DIFERENCIADA",due_date:null,amount:"25",currency:"BRL",synced_at:today,observed_installments:1,total_installments:12},
  ],incomplete:false});
  await handleIncomingMessage({from:"5511999990000",text:"Separe assinaturas de compras parceladas."});
  const response=m.send.mock.calls.map(call=>call[1]).join("\n");
  expect(response).toContain("Assinaturas registradas na Zelo (1)");
  expect(response).toContain("Recorrências estimadas pelos bancos (1)");
  expect(response).toContain("Registros de compras parceladas (2)");
  expect(response).toContain("Anuidades (1) separadas");
  expect(response).not.toContain("Aluguel");
  expect(m.process).not.toHaveBeenCalled();
});
it("answers the reported account comparison with manual accounts and active banks in separate sections", async () => {
  m.accounts.mockResolvedValue([{name:"Dinheiro",isDefault:true}]);
  m.process.mockResolvedValue({intent:"account_list",confidence:1});
  await handleIncomingMessage({from:"5511999990000",text:"Mostre minhas contas registradas manualmente separadas dos bancos"});
  const response=m.send.mock.calls.map(call=>call[1]).join("\n");
  expect(response).toContain("*Contas cadastradas manualmente*\n1. Dinheiro ⭐");
  expect(response).toContain("*Bancos conectados*\n1. Nubank");
  expect(m.accounts).toHaveBeenCalledWith("holder","personal");
  expect(m.rpc).toHaveBeenCalledWith(expect.objectContaining({mode:"personal"}),"zelo_of_overview",{p_environment:"production"});
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
it("lets the structured query answer bill dates that the legacy phrase parser cannot resolve", async () => {
  const today = todayStrBR();
  const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
  m.process.mockResolvedValue({ intent: "bank_query", confidence: .96, bankQuery: { kind: "bill_due" }, period: { from: tomorrow, to: tomorrow } });
  m.rpc.mockImplementation(async (_scope, name) => name === "zelo_of_agenda"
    ? { items: [{ id: "bill", kind: "bill", institution_name: "Nubank", resource_name: "Gold", description: "Fatura", due_date: tomorrow, amount: "75", currency: "BRL", synced_at: today }], incomplete: false }
    : {});
  await handleIncomingMessage({ from: "5511999990000", text: "Quais faturas vencem amanhã?" });
  const response = m.send.mock.calls.map(call => call[1]).join("\n");
  expect(m.process).toHaveBeenCalledOnce();
  expect(response).toContain("Faturas com vencimento informado");
  expect(response).toContain(bankMoney("75", "BRL"));
  expect(response).not.toContain("Não encontrei vencem");
});
it("routes the largest bank credit to the AI plan instead of answering with generic position guidance", async () => {
  m.process.mockResolvedValue({ intent: "bank_query", confidence: .96, bankQuery: { kind: "transactions", operation: "max", direction: "credit", source: "account" }, period: { from: "2026-10-01", to: "2026-10-31" } });
  m.read.mockResolvedValue({ entries: [
    { id: "credit", mode: "personal", source: "bank", included: true, type: "income", status: "posted", date: "2026-10-10", description: "Crédito recebido", amount: 80, category: "Outros", bank: { amount: "80", currency: "BRL", direction: "credit", resource_type: "account", institution_name: "Nubank" } },
  ], bank: { overview: { connections: [{ institution_name: "Nubank" }] }, report: { sync_pending: false, missing_dates: 0, last_successful_sync_at: "2026-10-11" } } });
  await handleIncomingMessage({ from: "5511999990000", text: "Qual foi o maior crédito bancário do mês?" });
  const response = m.send.mock.calls.map(call => call[1]).join("\n");
  expect(m.process).toHaveBeenCalledOnce();
  expect(response).toContain("Crédito recebido");
  expect(response).not.toContain("Posso consultar saldos bancários");
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
  expect(response).toContain("Compra teste"); expect(response).toContain("Última parcela identificada: 12 de 12"); expect(response).toContain("moeda não informada"); expect(response).not.toContain("Nenhum lançamento recorrente ou parcelado ativo");
  expect(m.send.mock.calls.every(call => call[2]?.privateFinancial)).toBe(true);
});
it("answers bank subscriptions missing a manual registration without listing capabilities or registered subscriptions",async()=>{
 m.process.mockImplementation(async(message:string)=>getExplicitRecurringQueryResult(message));
 m.recurring.mockResolvedValue([{description:"Netflix",type:"expense",recurrenceType:"recurring"}]);
 const due=new Date(Date.parse(`${todayStrBR()}T12:00:00Z`)+30*86400000).toISOString().slice(0,10);
 m.rpc.mockResolvedValue({incomplete:false,items:[
  {id:"netflix",kind:"recurring",description:"Netflix",institution_name:"Nubank",resource_name:"Platinum",amount:"20.90",currency:"BRL",due_date:due,synced_at:todayStrBR()},
  {id:"google",kind:"recurring",description:"Google One",institution_name:"Nubank",resource_name:"Platinum",amount:"96.99",currency:"BRL",due_date:due,synced_at:todayStrBR()},
  {id:"delivery",kind:"recurring",description:"Zé Delivery",institution_name:"Nubank",resource_name:"Platinum",amount:"51.07",currency:"BRL",due_date:due,synced_at:todayStrBR()},
 ]});
 await handleIncomingMessage({from:"5511999990000",text:"Quais assinaturas foram detectadas pelo banco e não cadastradas por mim?"});
 const response=m.send.mock.calls.map(call=>call[1]).join("\n");
 expect(response).toContain("Google One");expect(response).not.toContain("Netflix");expect(response).not.toContain("Zé Delivery");
 expect(response).not.toContain("Posso consultar saldos bancários");expect(response).toContain("cadastro manual semelhante");
});
it("names only recurring charges with missing amount or currency and explains the limit of bank estimates",async()=>{
 m.process.mockImplementation(async(message:string)=>getExplicitRecurringQueryResult(message));
 m.recurring.mockResolvedValue([{description:"Cadastro manual",type:"expense",recurrenceType:"recurring",amount:30,nextDueDate:"2026-11-10"}]);
 const due=new Date(Date.parse(`${todayStrBR()}T12:00:00Z`)+30*86400000).toISOString().slice(0,10);
 m.rpc.mockResolvedValue({incomplete:false,items:[
  {id:"missing-amount",kind:"recurring",description:"Sem valor",institution_name:"Nubank",resource_name:"Platinum",amount:null,currency:"BRL",due_date:due,synced_at:todayStrBR()},
  {id:"missing-currency",kind:"recurring",description:"Sem moeda",institution_name:"Sicredi",resource_name:"Gold",amount:"20.90",currency:null,due_date:due,synced_at:todayStrBR()},
  {id:"estimate",kind:"recurring",description:"Estimativa completa",institution_name:"Nubank",resource_name:"Platinum",amount:"55",currency:"BRL",due_date:due,synced_at:todayStrBR()},
 ]});
 await handleIncomingMessage({from:"5511999990000",text:"Quais cobranças recorrentes não têm valor confiável?"});
 const response=m.send.mock.calls.map(call=>call[1]).join("\n");
 expect(response).toContain("Sem valor");expect(response).toContain("Sem moeda");
 expect(response).not.toContain("Estimativa completa");expect(response).not.toContain("Cadastro manual");
 expect(response).toContain("indicador de confiança");expect(response).toContain("estimativas");
 expect(m.confirm).not.toHaveBeenCalled();
});
it("does not pretend to identify unreliable amounts when every bank recurrence has amount and currency",async()=>{
 m.process.mockImplementation(async(message:string)=>getExplicitRecurringQueryResult(message));
 const due=new Date(Date.parse(`${todayStrBR()}T12:00:00Z`)+30*86400000).toISOString().slice(0,10);
 m.rpc.mockResolvedValue({incomplete:false,items:[{id:"estimate",kind:"recurring",description:"Estimativa completa",institution_name:"Nubank",resource_name:"Platinum",amount:"55",currency:"BRL",due_date:due,synced_at:todayStrBR()}]});
 await handleIncomingMessage({from:"5511999990000",text:"Quais cobranças recorrentes não têm valor confiável?"});
 const response=m.send.mock.calls.map(call=>call[1]).join("\n");
 expect(response).toContain("não consigo identificar quais valores estão incorretos");
 expect(response).not.toContain("Estimativa completa");
});
it("totals only future installments whose amount, count and currency are known",async()=>{
 m.process.mockImplementation(async(message:string)=>getExplicitRecurringQueryResult(message));
 m.recurring.mockResolvedValue([{id:"manual",description:"Parcela manual",type:"expense",recurrenceType:"installment",amount:20,totalInstallments:5,paidInstallments:2,nextDueDate:"2026-11-10"}]);
 m.rpc.mockResolvedValue({incomplete:false,items:[
  {id:"bank",kind:"installment",description:"Compra bancária",institution_name:"Banco fictício",resource_name:"Gold",amount:"40",currency:"BRL",due_date:null,synced_at:todayStrBR(),total_installments:4,observed_installments:1},
  {id:"unknown",kind:"installment",description:"Compra sem total",institution_name:"Banco fictício",resource_name:"Gold",amount:"90",currency:"BRL",due_date:null,synced_at:todayStrBR(),total_installments:null,observed_installments:1},
  {id:"subscription",kind:"recurring",description:"Assinatura",institution_name:"Banco fictício",resource_name:"Gold",amount:"100",currency:"BRL",due_date:null,synced_at:todayStrBR()},
 ]});
 await handleIncomingMessage({from:"5511999990000",text:"Quanto ainda falta nas parcelas com total conhecido?"});
 const response=m.send.mock.calls.map(call=>call[1]).join("\n");
 expect(response).toContain(bankMoney("60", "BRL"));expect(response).toContain(bankMoney("120", "BRL"));
 expect(response).not.toContain(bankMoney("180", "BRL"));
 expect(response).toContain("Parcela manual");expect(response).toContain("Compra bancária");
 expect(response).not.toContain("Compra sem total");expect(response).not.toContain("Assinatura");
 expect(response).toContain("não confirma pagamento");
 expect(response).not.toContain("Parcelamentos recebidos dos bancos");
 expect(m.confirm).not.toHaveBeenCalled();
});
it("does not invent reais for bank installments without currency",async()=>{
 m.process.mockImplementation(async(message:string)=>getExplicitRecurringQueryResult(message));
 m.rpc.mockResolvedValue({incomplete:false,items:[{id:"bank",kind:"installment",description:"Compra sem moeda",institution_name:"Banco fictício",resource_name:"Gold",amount:"40",currency:null,due_date:null,synced_at:todayStrBR(),total_installments:4,observed_installments:1}]});
 await handleIncomingMessage({from:"5511999990000",text:"Quanto ainda falta nas parcelas com total conhecido?"});
 const response=m.send.mock.calls.map(call=>call[1]).join("\n");
 expect(response).toContain("120,00");expect(response).toContain("moeda não informada");
 expect(response).toContain("não há subtotal em moeda informada");
 expect(response).not.toContain("R$ 120,00");
 expect(response).not.toContain("Nenhum recorrente ou parcelamento cadastrado manualmente");
});
it("answers the exact missing installment total question without listing known totals",async()=>{
 m.rpc.mockResolvedValue({incomplete:false,items:[
  {id:"known",kind:"installment",resource_id:"card",description:"Compra 2 de 10",institution_name:"Banco fictício",resource_name:"Gold",amount:"20",currency:"BRL",due_date:null,synced_at:todayStrBR(),total_installments:10,observed_installments:2},
  {id:"missing",kind:"installment",resource_id:"card",description:"Compra sem total",institution_name:"Banco fictício",resource_name:"Gold",amount:"30",currency:"BRL",due_date:null,synced_at:todayStrBR(),total_installments:null,observed_installments:1},
 ]});
 await handleIncomingMessage({from:"5511999990000",text:"Quais parcelas não têm número total informado?"});
 const response=m.send.mock.calls.map(call=>call[1]).join("\n");
 expect(response).toContain("Compra sem total");expect(response).not.toContain("Compra 2 de 10");
 expect(m.process).not.toHaveBeenCalled();expect(m.confirm).not.toHaveBeenCalled();
});
it("separates annuities from purchases using bank records without falling into generic help",async()=>{
 m.rpc.mockResolvedValue({incomplete:false,items:[
  {id:"fee",kind:"installment",resource_id:"card",description:"ANUIDADE DIFERENCIADA",institution_name:"Banco fictício",resource_name:"Gold",amount:"25",currency:"BRL",due_date:null,synced_at:"2026-10-11",total_installments:12,observed_installments:1},
  {id:"purchase",kind:"installment",resource_id:"card",description:"Geladeira",institution_name:"Banco fictício",resource_name:"Gold",amount:"80",currency:"BRL",due_date:null,synced_at:"2026-10-11",total_installments:10,observed_installments:2},
 ]});
 await handleIncomingMessage({from:"5511999990000",text:"Separe anuidade de compras parceladas."});
 const response=m.send.mock.calls.map(call=>call[1]).join("\n");
 expect(response).toContain("Anuidades (1)");expect(response).toContain("Compras parceladas (1)");
 expect(response).toContain("Geladeira");expect(response).not.toContain("Você gostaria de ver");
 expect(m.process).not.toHaveBeenCalled();expect(m.confirm).not.toHaveBeenCalled();
 expect(m.send.mock.calls.every(call=>call[2]?.privateFinancial)).toBe(true);
});
it("says bank installment end dates cannot be projected from undated observations",async()=>{
 m.process.mockImplementation(async(message:string)=>getExplicitRecurringQueryResult(message,new Date(2026,9,15,12,0,0)));
 const agenda={incomplete:false,items:[{id:"undated",kind:"installment",resource_id:"card",description:"Geladeira",institution_name:"Banco fictício",resource_name:"Gold",amount:"80",currency:"BRL",due_date:null,synced_at:"2026-10-11",total_installments:10,observed_installments:2}]};
 m.rpc.mockImplementation(async(_scope,op)=>op==="zelo_of_overview"?{connections:[{id:"bank",status:"active",institution_name:"Banco fictício"}],resources:[{id:"card",connection_id:"bank",resource_type:"card"}],credit:[],agenda}:op==="zelo_of_credit_data"?{payments:[],plans:[],progress:[]}:{items:[],incomplete:false});
 await handleIncomingMessage({from:"5511999990000",text:"Quais parcelamentos terminam neste mês?"});
 const response=m.send.mock.calls.map(call=>call[1]).join("\n");
 expect(response).toContain("sem dados suficientes ficaram fora do total");
 expect(response).not.toContain("termina em 10/2026");
 expect(m.confirm).not.toHaveBeenCalled();
});
it("answers the exact monthly-relief request with loans and bank installments ending by January only",async()=>{
 vi.useFakeTimers({toFake:["Date"]});vi.setSystemTime(new Date("2026-11-02T15:00:00Z"));
 try{
  m.process.mockImplementation(async(message:string)=>getExplicitRecurringQueryResult(message));
  m.rpc.mockImplementation(async(_scope,op)=>op==="zelo_of_overview"?{connections:[{id:"bank",status:"active",institution_name:"Banco fictício"}],resources:[{id:"loan",connection_id:"bank",resource_type:"loan",name:"Empréstimo que termina"},{id:"later",connection_id:"bank",resource_type:"loan",name:"Empréstimo posterior"},{id:"card",connection_id:"bank",resource_type:"card",name:"Cartão fictício"}],credit:[{resource_id:"loan",currency:"BRL",outstanding_amount:"100",next_installment_amount:"30",due_date:"2026-12-20"},{resource_id:"later",currency:"BRL",outstanding_amount:"900",next_installment_amount:"800",due_date:"2027-02-01"}],agenda:{items:[],incomplete:false}}:op==="zelo_of_credit_data"?{payments:[],plans:[],progress:[{resource_id:"loan",periodicity:"MENSAL"},{resource_id:"later",periodicity:"MENSAL"}]}:{items:[{id:"purchase",resource_id:"card",description:"Compra que termina",resource_name:"Cartão fictício",institution_name:"Banco fictício",amount:"20",currency:"BRL",bill_month:"2026-10-01",observed_installments:1,total_installments:3,synced_at:"2026-11-02"}],incomplete:false});
  await handleIncomingMessage({from:"5511999990000",text:"quanto elimino de contas ate janeiro"});
  const reply=m.send.mock.calls.map(call=>call[1]).join("\n");
  expect(reply).toContain("R$ 50,00 por mês");expect(reply).toContain("31/01/2027");expect(reply).toContain("Empréstimo que termina");expect(reply).toContain("Compra que termina");expect(reply).not.toContain("Empréstimo posterior");expect(reply).not.toContain("Assinaturas recorrentes");expect(m.confirm).not.toHaveBeenCalled();
 }finally{vi.useRealTimers();}
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
it("answers a combined parcel, invoice and recurring question instead of listing capabilities",async()=>{
 vi.useFakeTimers({toFake:["Date"]});vi.setSystemTime(new Date("2026-11-02T15:00:00Z"));
 try{
  m.process.mockImplementation(async(message:string)=>getExplicitRecurringQueryResult(message));
  m.rpc.mockResolvedValue({incomplete:false,items:[{id:"fixture-bank",kind:"installment",resource_id:"card",description:"Parcela bancária fictícia",institution_name:"Banco fictício",resource_name:"Gold",amount:"49.90",currency:"BRL",due_date:null,synced_at:"2026-10-11",total_installments:12,observed_installments:2},{id:"bill",kind:"bill",resource_id:"card",description:"Fatura fictícia",institution_name:"Banco fictício",resource_name:"Gold",amount:"70",currency:"BRL",due_date:"2026-11-10",synced_at:"2026-10-11"},{id:"recurring",kind:"recurring",resource_id:"card",description:"Recorrência fictícia",institution_name:"Banco fictício",resource_name:"Gold",amount:"25",currency:"BRL",due_date:"2026-11-11",synced_at:"2026-10-11"}]});
  await handleIncomingMessage({from:"5511999990000",text:"Quanto ainda tenho parcelado até dezembro? Separe compras, faturas e cobranças recorrentes."});
  const response=m.send.mock.calls.map(call=>call[1]).join("\n");
  expect(response).toContain("sem vencimento informado ficaram fora do filtro de datas");
  expect(response).toContain("Faturas recebidas"); expect(response).toContain("Recorrência fictícia");
  expect(response).not.toContain("Posso consultar saldos bancários");
 }finally{vi.useRealTimers();}
});
it("does not count undated installments in a dated subscription-only query",async()=>{
 vi.useFakeTimers({toFake:["Date"]});vi.setSystemTime(new Date("2026-11-02T15:00:00Z"));
 try{
  m.process.mockResolvedValue({intent:"recurring_query",confidence:.95,period:{from:"2026-11-01",to:"2026-11-30"}});
  m.rpc.mockResolvedValue({incomplete:false,items:[{id:"undated",kind:"installment",description:"Parcela não solicitada",institution_name:"Banco fictício",resource_name:"Gold",amount:"40",currency:"BRL",due_date:null,synced_at:"2026-10-11"},{id:"subscription",kind:"recurring",description:"Assinatura solicitada",institution_name:"Banco fictício",resource_name:"Gold",amount:"25",currency:"BRL",due_date:"2026-11-10",synced_at:"2026-10-11"}]});
  await handleIncomingMessage({from:"5511999990000",text:"quais assinaturas tenho em novembro"});
  const response=m.send.mock.calls.map(call=>call[1]).join("\n");
  expect(response).toContain("Assinatura solicitada");expect(response).not.toContain("Parcela não solicitada");expect(response).not.toContain("sem vencimento informado ficaram fora");
 }finally{vi.useRealTimers();}
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
it("answers the reported next vehicle installment question from the financing contract",async()=>{
 m.rpc.mockResolvedValue({connections:[{id:"si",institution_name:"Sicredi",status:"active"}],resources:[{id:"car",connection_id:"si",resource_type:"financing",name:"VEICULOS E UTILITARIOS LEVES - REVENDAS",synced_at:"2026-10-11"}],credit:[{resource_id:"car",currency:"BRL",outstanding_amount:"7654.32",contract_amount:"18000",next_installment_amount:"450"}],limits:[],bills:[],sync:[]});
 await handleIncomingMessage({from:"5511999990000",text:"Qual é o valor da próxima parcela do financiamento do meu carro no Sicredi? Se não constar nos dados bancários, diga isso claramente."});
 const response=m.send.mock.calls.map(call=>call[1]).join("\n");
 expect(response).toContain(`Valor da próxima parcela: ${bankMoney("450","BRL")}`);
 expect(response).not.toContain("Parcelamentos recebidos dos bancos");
 expect(m.process).not.toHaveBeenCalled();
});
it("answers overdue, latest and minimum bill questions from scoped bank records instead of generic capabilities",async()=>{
 m.rpc.mockResolvedValue({connections:[{id:"nu",institution_name:"Nubank",status:"active"}],resources:[{id:"card",connection_id:"nu",resource_type:"card",name:"Platinum",identification_last4:"1234"}],bills:[
  {id:"latest",resource_id:"card",currency:"BRL",due_date:"2026-10-02",total_amount:"2215.51",minimum_payment_amount:"1054.96",status:"unknown"},
  {id:"old",resource_id:"card",currency:"BRL",due_date:"2026-09-02",total_amount:"704.46",minimum_payment_amount:"105.67",status:"unknown"},
 ],limits:[],credit:[],sync:[]});
 await handleIncomingMessage({from:"5511999990000",text:"Quais faturas já venceram e o banco ainda não confirmou pagamento?"});
 await handleIncomingMessage({from:"5511999990000",text:"Mostre a fatura atual de cada cartão por banco."});
 await handleIncomingMessage({from:"5511999990000",text:"Qual é o pagamento mínimo informado para cada fatura?"});
 const replies=m.send.mock.calls.map(call=>call[1]).join("\n");
 expect(replies).toContain("pagamento não confirmado nos dados recebidos");
 expect(replies).toContain("último vencimento recebido 02/10/2026");
 expect(replies).toContain("pagamento mínimo R$ 1.054,96");
 expect(replies).not.toContain("704,46");
 expect(replies).not.toContain("Posso consultar saldos bancários");
 expect(m.process).not.toHaveBeenCalled();
});
it("separates the latest bill from card purchases without counting a bill payment as a purchase",async()=>{
 const overview={connections:[{id:"nu",institution_name:"Nubank",status:"active"}],resources:[{id:"card",connection_id:"nu",resource_type:"card",name:"Platinum"}],bills:[{id:"latest",resource_id:"card",currency:"BRL",due_date:"2026-10-02",total_amount:"2215.51",status:"unknown"}],limits:[],credit:[],sync:[]};
 m.read.mockResolvedValue({bank:{overview},entries:[
  {id:"purchase",source:"bank",mode:"personal",status:"posted",included:true,type:"expense",amount:35,date:todayStrBR(),description:"Mercado",bank:{resource_id:"card",resource_type:"card",direction:"debit",currency:"BRL",amount:"35"}},
  {id:"payment",source:"bank",mode:"personal",status:"posted",included:true,type:"expense",amount:500,date:todayStrBR(),description:"Pagamento de fatura",bank:{resource_id:"card",resource_type:"card",direction:"debit",currency:"BRL",amount:"500"}},
 ]});
 await handleIncomingMessage({from:"5511999990000",text:"Separe o valor da fatura das compras já realizadas no cartão."});
 const response=m.send.mock.calls.map(call=>call[1]).join("\n");
 expect(response).toContain("2.215,51");expect(response).toContain("35,00");expect(response).not.toContain("500,00");
 expect(response).toContain("Não some esses valores");expect(m.process).not.toHaveBeenCalled();
 expect(m.read).toHaveBeenCalledOnce();
});
it("explains paid bills without claiming the bank confirmed a payment",async()=>{
 await handleIncomingMessage({from:"5511999990000",text:"Uma fatura quitada pode continuar aparecendo no extrato?"});
 const response=m.send.mock.calls.map(call=>call[1]).join("\n");
 expect(response).toContain("histórico");expect(response).toContain("permanece desconhecido");
 expect(response).not.toContain("será marcada");expect(m.process).not.toHaveBeenCalled();
 expect(m.rpc).not.toHaveBeenCalled();
});
it("explains a closed bill without claiming that closing means paid",async()=>{
 await handleIncomingMessage({from:"5511999990000",text:"Qual é a diferença entre fatura fechada e compra em aberto?"});
 const response=m.send.mock.calls.map(call=>call[1]).join("\n");
 expect(response).toContain("ciclo encerrado");expect(response).toContain("não significa que já foi paga");
 expect(m.process).not.toHaveBeenCalled();expect(m.rpc).not.toHaveBeenCalled();
});
it("answers confirmed and partial bill payments from bank evidence only",async()=>{
 m.rpc.mockResolvedValue({connections:[{id:"nu",institution_name:"Nubank",status:"active"}],resources:[{id:"card",connection_id:"nu",resource_type:"card",name:"Platinum"}],bills:[
  {id:"paid",resource_id:"card",currency:"BRL",due_date:"2026-09-02",total_amount:"100",payment_amount:"100",payment_evidence:true,status:"paid"},
  {id:"partial",resource_id:"card",currency:"BRL",due_date:"2026-10-02",total_amount:"200",payment_amount:"50",payment_evidence:true,status:"partial"},
 ],limits:[],credit:[],sync:[]});
 await handleIncomingMessage({from:"5511999990000",text:"Quais bancos confirmaram pagamento de fatura?"});
 await handleIncomingMessage({from:"5511999990000",text:"Liste pagamentos parciais informados nas faturas."});
 const response=m.send.mock.calls.map(call=>call[1]).join("\n");
 expect(response).toContain("Bancos com pagamento de fatura informado");expect(response).toContain("pagamento parcial informado");
 expect(response).toContain("50,00");expect(m.process).not.toHaveBeenCalled();
});
it("interprets Empresa as the requested mode when Pessoal is explicitly excluded",async()=>{
 await handleIncomingMessage({from:"5511999990000",text:"Mostre as faturas do modo Empresa sem misturar com o Pessoal."});
 const response=m.send.mock.calls.map(call=>call[1]).join("\n");
 expect(response).toContain("Última fatura recebida de cada cartão · Empresa");
 expect(response).not.toContain("Escolha um modo por consulta");
 expect(m.access).toHaveBeenCalledWith(expect.objectContaining({id:"holder"}),"business",expect.any(Object));
 expect(m.process).not.toHaveBeenCalled();
});
it("lists only active cards without any received bill",async()=>{
 await handleIncomingMessage({from:"5511999990000",text:"Quais cartões não enviaram dados de fatura?"});
 const response=m.send.mock.calls.map(call=>call[1]).join("\n");
 expect(response).toContain("Cartões sem fatura recebida");expect(response).toContain("Nubank · Platinum");
 expect(m.process).not.toHaveBeenCalled();
});
it("answers the next loan installment question without using card installments",async()=>{
 await handleIncomingMessage({from:"5511999990000",text:"Qual é o valor da próxima parcela de cada empréstimo pessoal? Avise quais bancos não informaram esse valor."});
 const response=m.send.mock.calls.map(call=>call[1]).join("\n");
 expect(response).toContain("Valor da próxima parcela não informado pelo banco");
 expect(response).not.toContain("Parcelamentos recebidos dos bancos");
 expect(m.process).not.toHaveBeenCalled();
});
it("shows only a zero-balance loan as possibly settled, without inventing a bank name",async()=>{
 m.rpc.mockResolvedValue({connections:[{id:"nu",institution_name:"Nubank",status:"active"}],resources:[{id:"loan",connection_id:"nu",resource_type:"loan",name:"Contrato teste",synced_at:"2026-10-11"}],credit:[{resource_id:"loan",currency:"BRL",outstanding_amount:"0.00000000",contract_amount:"100"}],limits:[],bills:[],sync:[]});
 await handleIncomingMessage({from:"5511999990000",text:"Quais empréstimos pessoais já estão quitados? Separe por banco e não conte como dívida."});
 const response=m.send.mock.calls.map(call=>call[1]).join("\n");
 expect(response).toContain("Contrato teste");expect(response).toContain("não confirma quitação contratual");
 expect(response).not.toContain("ja estao quitados? separe");expect(m.process).not.toHaveBeenCalled();
});

it.each([
 ["quando e minha ultima parcela do veiculo","20/06/2027"],
 ["quando termina meu empréstimo no Banco Exemplo","10/02/2027"],
 ["quantas parcelas faltam do empréstimo no Banco Exemplo","3"],
 ["qual valor da parcela do veículo","100,00"],
])("answers a specific installment field instead of asking for a cutoff: %s",async(text,expected)=>{
 m.rpc.mockImplementation(async(_scope,op)=>op==="zelo_of_overview"?{connections:[{id:"bank",status:"active",institution_name:"Banco Exemplo"}],resources:[{id:"car",connection_id:"bank",resource_type:"financing",name:"Veículos leves"},{id:"loan",connection_id:"bank",resource_type:"loan",name:"Crédito pessoal"}],credit:[{resource_id:"car",currency:"BRL",outstanding_amount:"900",next_installment_amount:null,due_date:"2027-06-20"},{resource_id:"loan",currency:"BRL",outstanding_amount:"200",next_installment_amount:"50",due_date:"2027-02-10"}]}:op==="zelo_of_credit_data"?{payments:[],plans:[{resource_id:"car",amount:"100",currency:"BRL",first_due_date:"2026-07-20",last_due_date:"2027-06-20"}],progress:[{resource_id:"loan",paid_installments:1,total_installments:4,remaining_installments:3}]}:{items:[],incomplete:false});
 await handleIncomingMessage({from:"5511999990000",text});const response=m.send.mock.calls.map(call=>call[1]).join("\n");
 expect(response).toContain(expected);expect(response).not.toContain("Até qual data");expect(m.process).not.toHaveBeenCalled();expect(m.confirm).not.toHaveBeenCalled();
});
it("preserves the named bank when asking how much credit is available",async()=>{
 m.rpc.mockResolvedValue({connections:[{id:"bank",status:"active",institution_name:"Banco Santander Pessoa Física"},{id:"other",status:"active",institution_name:"Banco Exemplo"}],resources:[{id:"card",connection_id:"bank",resource_type:"card",name:"Gold"},{id:"other-card",connection_id:"other",resource_type:"card",name:"Outro"}],limits:[{resource_id:"card",line_name:"À vista",currency:"BRL",available_amount:"321",total_amount:"500",used_amount:"179"},{resource_id:"other-card",line_name:"À vista",currency:"BRL",available_amount:"999",total_amount:"1000",used_amount:"1"}],credit:[],bills:[],sync:[]});
 await handleIncomingMessage({from:"5511999990000",text:"quanto tenho de limite no santander"});
 const response=m.send.mock.calls.map(call=>call[1]).join("\n");expect(response).toContain("321,00");expect(response).not.toContain("999,00");expect(m.process).not.toHaveBeenCalled();
});
