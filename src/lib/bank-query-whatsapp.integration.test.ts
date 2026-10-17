import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ access: vi.fn(), rpc: vi.fn(), read: vi.fn() }));
vi.mock("./open-finance-access", () => ({ getOpenFinanceAccess: m.access, canEnrollOpenFinance: () => true }));
vi.mock("./open-finance-http", () => ({ openFinanceRpc: m.rpc }));
vi.mock("./unified-finances", () => ({ readUnifiedFinances: m.read }));
import { answerBankWhatsAppMessage, answerConnectedFinanceQuery } from "./open-finance-whatsapp";
import { bankMoney, type BankOverview } from "./open-finance-display";
import type { User } from "./users";
const user = { id: "holder", email: "holder@example.test", name: "Maickel", plan: "business", status: "active", activeMode: "personal" } as User;
const data: BankOverview = { connections: [{ id: "c", institution_name: "Nubank", status: "active", provider_status: null, scopes: [], consent_expires_at: null, revoked_at: null, last_successful_sync_at: null, created_at: "2026-10-11" }], resources: [{ id: "l", connection_id: "c", resource_type: "loan", name: "Crédito pessoal", subtype: null, card_network: null, identification_last4: null, currency: "BRL", available_amount: null, gross_amount: null, net_amount: null, valuation_date: null, synced_at: "2026-10-11" }], credit: [{ resource_id: "l", currency: "BRL", contract_amount: "5000", outstanding_amount: "1200.10", next_installment_amount: null, due_date: null }], limits: [], bills: [], sync: [] };
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv("OPEN_FINANCE_WHATSAPP_ENABLED", "true"); m.access.mockResolvedValue({ userId: user.id, mode: "personal", environment: "production" }); m.rpc.mockResolvedValue(data); });
afterEach(() => vi.unstubAllEnvs());
it("answers the actual loan command with saved bank debt, never with expenses", async () => {
  const response = await answerBankWhatsAppMessage(user, "personal", "both", "zelo quanto eu tenho de emprestimo?", "2026-10-11");
  expect(response).toContain(bankMoney("1200.10", "BRL")); expect(response).toContain("Nubank"); expect(response).not.toContain("Você gastou"); expect(m.read).not.toHaveBeenCalled();
});
it("keeps unsupported debt questions from becoming an expense answer", async () => {
  const response = await answerBankWhatsAppMessage(user, "personal", "both", "Quanto eu tinha de empréstimos mês passado?", "2026-10-11");
  expect(response).toContain("dados atuais"); expect(m.rpc).not.toHaveBeenCalled();
});
it("answers the last received balance for each bank instead of giving generic guidance", async () => {
  m.rpc.mockResolvedValue({...data,resources:[...data.resources,{...data.resources[0],id:"account",resource_type:"account",name:"Conta",available_amount:"123.45",synced_at:"2026-10-15"}]});
  const response=await answerBankWhatsAppMessage(user,"personal","both","Qual era o saldo informado por cada banco na última atualização?","2026-10-15");
  expect(response).toContain("Nubank");expect(response).toContain(bankMoney("123.45","BRL"));expect(response).toContain("15/10/2026");
  expect(response).not.toContain("Consigo consultar");
  expect(m.rpc).toHaveBeenCalled();
});
it("explains account balance versus card credit without treating the limit as cash", async () => {
  const response=await answerBankWhatsAppMessage(user,"personal","both","Qual a diferença entre saldo disponível e limite do cartão?","2026-10-15");
  expect(response).toContain("conta");expect(response).toContain("crédito");expect(response).toContain("fatura");
  expect(response).toContain("não deve ser somado");expect(response).not.toContain("Posso consultar");
  expect(m.rpc).not.toHaveBeenCalled();
});
it("routes the exact used-limit and available-only WhatsApp requests to saved bank limits", async () => {
  m.rpc.mockResolvedValue({...data,resources:[...data.resources,{...data.resources[0],id:"card",resource_type:"card",name:"Cartão Gold"}],limits:[{id:"limit",resource_id:"card",line_name:"CREDITO_A_VISTA",consolidation_type:"CONSOLIDADO",currency:"BRL",total_amount:"100",used_amount:"60",available_amount:"40",is_flexible:false}]});
  const used=await answerBankWhatsAppMessage(user,"personal","both","Quanto do limite de cada cartão já foi usado?","2026-10-15");
  const available=await answerBankWhatsAppMessage(user,"personal","both","Mostre apenas os cartões com limite disponível informado.","2026-10-15");
  expect(used).toContain(`Utilizado: ${bankMoney("60","BRL")}`);
  expect(available).toContain(`Disponível: ${bankMoney("40","BRL")}`);
  expect(m.rpc).toHaveBeenCalledTimes(2);
});
it("answers shared-limit questions from received bank data without claiming card linkage", async () => {
  m.rpc.mockResolvedValue({...data,resources:[...data.resources,{...data.resources[0],id:"card",resource_type:"card",name:"Cartão Gold"}],limits:[{id:"limit",resource_id:"card",line_name:"CREDITO_A_VISTA",consolidation_type:"CONSOLIDADO",currency:"BRL",total_amount:"100",used_amount:"60",available_amount:"40",is_flexible:false}]});
  const response=await answerBankWhatsAppMessage(user,"personal","both","Há linhas de crédito compartilhadas que não devem ser somadas?","2026-10-15");
  expect(response).toContain("Nubank: 1 linha consolidada");
  expect(response).toContain("não informam quais cartões compartilham");
  expect(response).not.toContain("Sou a Zoe");
  expect(m.rpc).toHaveBeenCalledOnce();
});
it("keeps explanatory WhatsApp follow-ups focused on the requested card-limit subset", async () => {
  m.rpc.mockResolvedValue({...data, resources:[...data.resources,
    {...data.resources[0],id:"good",resource_type:"card",name:"Cartão certo"},
    {...data.resources[0],id:"bad",resource_type:"card",name:"Cartão divergente"},
    {...data.resources[0],id:"zero",resource_type:"card",name:"Cartão zero"}], limits:[
    {id:"good-limit",resource_id:"good",line_name:"CREDITO_A_VISTA",consolidation_type:"INDIVIDUAL",currency:"BRL",total_amount:"100",used_amount:"20",available_amount:"80",is_flexible:false},
    {id:"bad-limit",resource_id:"bad",line_name:"CREDITO_A_VISTA",consolidation_type:"INDIVIDUAL",currency:"BRL",total_amount:"100",used_amount:"100",available_amount:"20",is_flexible:false},
    {id:"zero-limit",resource_id:"zero",line_name:"CREDITO_A_VISTA",consolidation_type:"INDIVIDUAL",currency:"BRL",total_amount:"100",used_amount:"100",available_amount:"0",is_flexible:false},
  ]});
  const inconsistent=await answerBankWhatsAppMessage(user,"personal","both","Algum limite recebido está inconsistente com o total e o utilizado? Mostre só as linhas afetadas e não corrija valores por suposição.","2026-10-15");
  const highest=await answerBankWhatsAppMessage(user,"personal","both","Qual cartão tem o maior limite disponível? Mostre somente esse cartão e avise se o banco não informou algum limite.","2026-10-15");
  const lowest=await answerBankWhatsAppMessage(user,"personal","both","Qual cartão tem o menor limite disponível? Mostre somente esse cartão, incluindo valor zero se foi informado.","2026-10-15");
  expect(inconsistent).toContain("Cartão divergente");expect(inconsistent).not.toContain("Cartão certo");
  expect(highest).toContain("Cartão certo");expect(highest).not.toContain("Cartão divergente");
  expect(lowest).toContain("Cartão zero");expect(lowest).not.toContain("Cartão certo");
  expect(m.rpc).toHaveBeenCalledTimes(3);
});
it("answers bank-update follow-ups with missing received fields, not a capabilities list",async()=>{
  m.rpc.mockResolvedValue({...data,resources:[...data.resources,
    {...data.resources[0],id:"account",resource_type:"account",name:"Conta sem saldo",available_amount:null},
    {...data.resources[0],id:"card",resource_type:"card",name:"Cartão sem limite"}]});
  const response=await answerBankWhatsAppMessage(user,"personal","both","Explique quais saldos e limites ainda dependem de atualização bancária. Cite somente os dados faltantes e não invente prazo de sincronização.","2026-10-15");
  expect(response).toContain("Conta sem saldo");expect(response).toContain("Cartão sem limite");
  expect(response).toContain("não confirma saldo zero");expect(response).not.toContain("Posso consultar saldos bancários");
  expect(m.rpc).toHaveBeenCalledOnce();
});
it.each(["Por favor, qual era meu limite mês passado?", "Me mostra meus empréstimos mês passado", "Mostre meus saldos nos bancos mês passado"]) ("keeps historical positions out of the expense classifier even with courteous/colloquial wording: %s", async text => {
  expect(await answerBankWhatsAppMessage(user, "personal", "both", text, "2026-10-11")).toContain("dados atuais"); expect(m.rpc).not.toHaveBeenCalled();
});
it("uses the requested authorized mode and rejects a phone restricted to Personal", async () => {
  expect(await answerBankWhatsAppMessage(user, "personal", "personal", "Mostre meus empréstimos da empresa", "2026-10-11")).toContain("não tem acesso");
  expect(m.access).not.toHaveBeenCalled();
  expect(await answerBankWhatsAppMessage(user, "business", "personal", "Mostre meus empréstimos", "2026-10-11")).toContain("não tem acesso");
  await answerBankWhatsAppMessage(user, "personal", "both", "Mostre meus empréstimos da empresa", "2026-10-11");
  expect(m.access).toHaveBeenCalledWith(user, "business");
});
it("lists company loans separately without searching for a bank named separately",async()=>{
  m.access.mockResolvedValue({userId:user.id,mode:"business",environment:"production",companyName:"Empresa teste"});
  const response=await answerBankWhatsAppMessage(user,"personal","both","Mostre empréstimos da empresa separadamente.","2026-10-17");
  expect(response).toContain("Nubank");
  expect(response).not.toContain("Não encontrei separadamente");
  expect(m.access).toHaveBeenCalledWith(user,"business");
  expect(m.rpc).toHaveBeenCalled();
});
it("asks for one mode rather than mixing Personal and companies", async () => {
  expect(await answerBankWhatsAppMessage(user, "personal", "both", "Mostre meus empréstimos pessoal e empresarial", "2026-10-11")).toContain("um modo"); expect(m.rpc).not.toHaveBeenCalled();
});
it("does not invent values or fall back to expenses when banking access is unavailable", async () => {
  m.access.mockResolvedValue(null);
  expect(await answerBankWhatsAppMessage(user, "personal", "both", "Quanto tenho de empréstimo?", "2026-10-11")).toContain("não está disponível"); expect(m.read).not.toHaveBeenCalled();
});
it("leaves registrations and spending to their existing handlers and respects the feature flag", async () => {
  for (const text of ["Registre um empréstimo de 500", "Quanto gastei mês passado?", "Pague meu empréstimo", "Quanto tenho de empréstimo e lance 50 de despesa"])
    expect(await answerBankWhatsAppMessage(user, "personal", "both", text, "2026-10-11")).toBeNull();
  vi.stubEnv("OPEN_FINANCE_WHATSAPP_ENABLED", "false"); expect(await answerBankWhatsAppMessage(user, "personal", "both", "Mostre meus empréstimos", "2026-10-11")).toBeNull(); expect(m.rpc).not.toHaveBeenCalled();
});
it("filters last-month Nubank card purchases and excludes other banks and manual entries", async () => {
  m.read.mockResolvedValue({ entries: [
    { id: "nu", mode: "personal", source: "bank", included: true, type: "expense", date: "2026-09-15", category: "Alimentação", description: "Compra", amount: 50, bank: { institution_name: "Nubank", resource_type: "card" } },
    { id: "si", mode: "personal", source: "bank", included: true, type: "expense", date: "2026-09-15", category: "Outros", description: "Compra", amount: 90, bank: { institution_name: "Sicredi", resource_type: "card" } },
    { id: "cash", mode: "personal", source: "whatsapp", included: true, type: "expense", date: "2026-09-15", category: "Outros", description: "Manual", amount: 1000 },
  ], bank: { overview: { connections: [...data.connections, { institution_name: "Sicredi" }] }, report: { sync_pending: false, missing_dates: 0, last_successful_sync_at: "2026-10-11" } } });
  const text = await answerBankWhatsAppMessage(user, "personal", "both", "Quanto gastei no cartão Nubank mês passado?", "2026-10-11");
  expect(text).toContain(bankMoney("50", "BRL")); expect(text).toContain("01/09/2026"); expect(text).not.toContain("1.000"); expect(text).not.toContain("Sicredi");
  expect(m.read).toHaveBeenCalledWith(user, "personal", "2026-09-01", "2026-09-30");
});
it("does not turn supermarket spending into Mercado Pago bank spending", async () => {
  m.read.mockResolvedValue({ entries: [], bank: { overview: { connections: [{ institution_name: "Mercado Pago" }] } } });
  expect(await answerBankWhatsAppMessage(user, "personal", "both", "Quanto gastei no mercado mês passado?", "2026-10-11")).toBeNull();
});
it("searches Amazonas in every connected bank and in recorded origins instead of querying one account or one category",async()=>{
  m.read.mockResolvedValue({entries:[
    {id:"nu",mode:"personal",source:"bank",included:true,type:"expense",date:"2026-10-02",category:"Outros",description:"AMAZONAS MERCAD LOJA",amount:24,bank:{institution_name:"Nubank",resource_type:"card"}},
    {id:"si",mode:"personal",source:"bank",included:true,type:"expense",date:"2026-10-03",category:"Alimentação",description:"Mercado Amazonas",amount:36,bank:{institution_name:"Sicredi",resource_type:"account"}},
    {id:"manual",mode:"personal",source:"whatsapp",included:true,type:"expense",date:"2026-10-04",category:"Outros",description:"Amazonas",amount:10},
    {id:"other",mode:"personal",source:"bank",included:true,type:"expense",date:"2026-10-03",category:"Alimentação",description:"Mercado diferente",amount:500,bank:{institution_name:"Sicredi",resource_type:"card"}},
  ],bank:{overview:{connections:[...data.connections,{institution_name:"Sicredi"}]},report:{sync_pending:false,missing_dates:0,last_successful_sync_at:"2026-10-11"}}});
  const response=await answerConnectedFinanceQuery(user,"personal","both",{intent:"finance_query",confidence:1,keyword:"Amazonas"},["2026-10-01","2026-10-31"],"quanto gastei no amazonas");
  expect(response).toContain(bankMoney("70","BRL")); expect(response).toContain("Nubank"); expect(response).toContain("Sicredi"); expect(response).toContain("WhatsApp"); expect(response).not.toContain("Mercado diferente");
});
it("matches a Facebook question to FACEBK card descriptions in the complete WhatsApp answer",async()=>{
  m.read.mockResolvedValue({entries:[
    {id:"facebook",mode:"personal",source:"bank",included:true,type:"expense",date:"2026-10-13",category:"Marketing",description:"FACEBK *65ZTF6SP34",amount:26.67,bank:{institution_name:"Mercado Pago",resource_type:"card"}},
    {id:"other",mode:"personal",source:"bank",included:true,type:"expense",date:"2026-10-13",category:"Marketing",description:"GOOGLE ADS",amount:100,bank:{institution_name:"Mercado Pago",resource_type:"card"}},
  ],bank:{overview:{connections:data.connections},report:{sync_pending:false,missing_dates:0,last_successful_sync_at:"2026-10-16"}}});
  const response=await answerConnectedFinanceQuery(user,"personal","both",{intent:"finance_query",confidence:1,keyword:"facebook"},["2026-10-01","2026-10-31"],"Quanto gastei no Facebook neste mês?");
  expect(response).toContain("FACEBK");
  expect(response).toContain(bankMoney("26.67","BRL"));
  expect(response).not.toContain("GOOGLE ADS");
  expect(response).not.toContain("R$ 0,00");
});
