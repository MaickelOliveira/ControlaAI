import {beforeEach,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
const m=vi.hoisted(()=>({access:vi.fn(),read:vi.fn(),bank:vi.fn(),pending:vi.fn(),recurring:vi.fn(),agenda:vi.fn(),financial:vi.fn(),rpc:vi.fn(),ledger:vi.fn()}));
vi.mock("./financial-agenda",()=>({readBankAgenda:m.agenda,readFinancialAgenda:m.financial}));
vi.mock("./open-finance-access",()=>({getOpenFinanceAccess:m.access,canEnrollOpenFinance:()=>true}));
vi.mock("./unified-finances",()=>({readUnifiedFinances:m.read}));
vi.mock("./open-finance-question",()=>({answerBankQuestion:m.bank,parseBankQuestion:()=>null}));
vi.mock("./open-finance-http",()=>({openFinanceRpc:m.rpc}));
vi.mock("./finance-ledger-storage",()=>({readBankLedger:m.ledger}));
vi.mock("./finances",()=>({expandMerchantAliases:(s:string)=>[s],getPendingFinances:m.pending}));
vi.mock("./recurring",()=>({getRecurringByUser:m.recurring}));
import {answerBankWhatsAppMessage,answerConnectedFinanceQuery} from "./open-finance-whatsapp";
import {bankMoney} from "./open-finance-display";
const user={id:"own-user",email:"user@example.test",plan:"business",activeMode:"personal",status:"active"} as const;
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv("OPEN_FINANCE_WHATSAPP_ENABLED","true");m.access.mockResolvedValue({userId:user.id,mode:"personal",environment:"production"});m.read.mockResolvedValue({entries:[{id:"bank:b",mode:"personal",included:true,source:"bank",date:"2026-09-10",type:"expense",category:"Outros",description:"Test",amount:35,bank:{resource_type:"account"}}],bank:{overview:{connections:[{}]},report:{sync_pending:false,missing_dates:0,last_successful_sync_at:null}}});m.pending.mockResolvedValue([]);m.recurring.mockResolvedValue([]);m.agenda.mockResolvedValue({items:[],incomplete:false});m.financial.mockResolvedValue({commitments:[],bank:{items:[],incomplete:false},forecasts:[],coverage:""});});
it("lists only authorized active banks in the requested personal mode",async()=>{
  m.rpc.mockResolvedValue({connections:[
    {institution_name:"Banco Pessoal",status:"active",archived_at:null},
    {institution_name:"Banco Antigo",status:"revoked",archived_at:"2026-10-10"},
  ],sync:[]});
  const answer=await answerBankWhatsAppMessage(user as never,"business","both","Quais bancos estão conectados no modo Pessoal?","2026-10-16");
  expect(answer).toContain("Banco Pessoal");expect(answer).toContain("Autorizado");
  expect(answer).not.toContain("Banco Antigo");
  expect(m.rpc).toHaveBeenCalledWith(expect.objectContaining({mode:"personal"}),"zelo_of_overview",{p_environment:"production"});
});
it("uses the company scope for business connection lists and enforces phone access",async()=>{
  m.access.mockResolvedValue({userId:user.id,mode:"business",environment:"production",companyName:"Samira"});
  m.rpc.mockResolvedValue({connections:[{institution_name:"Banco Empresa",status:"active",archived_at:null}],sync:[]});
  const answer=await answerBankWhatsAppMessage(user as never,"personal","both","Quais bancos estão conectados no modo Empresa?","2026-10-16");
  expect(answer).toContain("Banco Empresa");expect(answer).toContain("Empresa · Samira");expect(m.rpc).toHaveBeenCalledWith(expect.objectContaining({mode:"business"}),"zelo_of_overview",{p_environment:"production"});
  m.rpc.mockClear();
  expect(await answerBankWhatsAppMessage(user as never,"personal","personal","Quais bancos estão conectados no modo Empresa?","2026-10-16")).toContain("não tem acesso");
  expect(m.rpc).not.toHaveBeenCalled();
});
it("answers whether identified bill payments were categorized as Outros instead of using a spending total",async()=>{
  m.read.mockResolvedValue({entries:[
    {id:"manual-bill",mode:"personal",source:"web",date:"2026-10-10",status:"confirmed",type:"expense",included:true,category:"Outros",description:"Pagamento de fatura",amount:100},
    {id:"bank-bill",mode:"personal",source:"bank",date:"2026-10-11",status:"posted",type:"expense",included:false,category:"Transferências e pagamentos",description:"DEB. AUTOM. DE FATURA EM C/C",amount:100,bank:{resource_type:"account",institution_name:"Banco A"}},
  ],bank:{overview:{connections:[{status:"active"}]},report:{sync_pending:false}}});
  const answer=await answerBankWhatsAppMessage(user as never,"personal","both","Há pagamentos de fatura classificados como Outros?","2026-10-16");
  expect(answer).toContain("Sim");expect(answer).toContain("Pagamento de fatura");expect(answer).toContain("Outros");
  expect(answer).not.toContain("Você gastou R$ 0,00");
});
it("identifies included transfer-like debits without claiming they are own-account transfers",async()=>{
  m.read.mockResolvedValue({entries:[
    {id:"possible",mode:"personal",source:"bank",date:"2026-10-10",status:"posted",type:"expense",included:true,category:"Outros",description:"Transferência enviada pelo Pix|Samira",amount:50,bank:{resource_type:"account",institution_name:"Banco A",classification:"transfer",direction:"debit"}},
    {id:"own",mode:"personal",source:"bank",date:"2026-10-11",status:"posted",type:"expense",included:false,category:"Transferência entre contas próprias",description:"Pix entre contas",amount:50,bank:{resource_type:"account",institution_name:"Banco A",classification:"transfer",direction:"debit"}},
  ],bank:{overview:{connections:[{status:"active"}]},report:{sync_pending:false}}});
  const answer=await answerBankWhatsAppMessage(user as never,"personal","both","Há transferências classificadas como despesas?","2026-10-16");
  expect(answer).toContain("Samira");expect(answer).toContain("despesas");
  expect(answer).not.toContain("Pix entre contas");expect(answer).toContain("não comprova");
});
it("groups only card purchases by category without adding account debits",async()=>{
  m.read.mockResolvedValue({entries:[
    {id:"card-a",mode:"personal",source:"bank",date:"2026-10-10",status:"posted",type:"expense",included:true,category:"Alimentação",description:"Padaria",amount:40,bank:{resource_type:"card",institution_name:"Banco A",direction:"debit"}},
    {id:"card-b",mode:"personal",source:"bank",date:"2026-10-11",status:"posted",type:"expense",included:true,category:"Delivery",description:"Zé Delivery",amount:30,bank:{resource_type:"card",institution_name:"Banco A",direction:"debit"}},
    {id:"account",mode:"personal",source:"bank",date:"2026-10-12",status:"posted",type:"expense",included:true,category:"Alimentação",description:"Débito da conta",amount:90,bank:{resource_type:"account",institution_name:"Banco A",direction:"debit"}},
  ],bank:{overview:{connections:[{status:"active"}]},report:{sync_pending:false}}});
  const answer=await answerBankWhatsAppMessage(user as never,"personal","both","Mostre gastos de cartão por categoria sem duplicar débitos da conta.","2026-10-16");
  expect(answer).toContain("Alimentação");expect(answer).toContain("Delivery");expect(answer).toMatch(/R\$\s*70,00/);
  expect(answer).not.toMatch(/R\$\s*160,00/);expect(answer).toContain("conta bancária");
});
it("ranks establishments by purchase count rather than expense category",async()=>{
  m.read.mockResolvedValue({entries:[
    {id:"a",mode:"personal",source:"bank",date:"2026-10-10",status:"posted",type:"expense",included:true,category:"Alimentação",description:"Padaria Boa",amount:20,bank:{resource_type:"card",institution_name:"Banco A",direction:"debit",classification:"purchase"}},
    {id:"b",mode:"personal",source:"bank",date:"2026-10-11",status:"posted",type:"expense",included:true,category:"Alimentação",description:"Padaria Boa",amount:30,bank:{resource_type:"card",institution_name:"Banco A",direction:"debit",classification:"purchase"}},
    {id:"c",mode:"personal",source:"bank",date:"2026-10-12",status:"posted",type:"expense",included:true,category:"Alimentação",description:"Mercado Bom",amount:50,bank:{resource_type:"card",institution_name:"Banco A",direction:"debit",classification:"purchase"}},
  ],bank:{overview:{connections:[{status:"active"}]},report:{sync_pending:false}}});
  const answer=await answerBankWhatsAppMessage(user as never,"personal","both","Qual estabelecimento teve mais compras no mês?","2026-10-16");
  expect(answer).toContain("Padaria Boa");expect(answer).toContain("2 compras");
  expect(answer).not.toContain("Maior categoria");
});
it("does not read company purchases for a phone authorized only for Personal",async()=>{
  const answer=await answerBankWhatsAppMessage(user as never,"personal","personal","Qual estabelecimento teve mais compras no mês na empresa?","2026-10-16");
  expect(answer).toContain("não tem acesso");
  expect(m.read).not.toHaveBeenCalled();
});
it("asks for one mode when a merchant comparison spans Personal and Empresa",async()=>{
  const answer=await answerBankWhatsAppMessage(user as never,"personal","both","Qual estabelecimento teve mais compras no Pessoal e na Empresa?","2026-10-16");
  expect(answer).toContain("Escolha um modo");
  expect(m.read).not.toHaveBeenCalled();
});
it("explains available Open Finance data instead of returning connection steps",async()=>{
  const answer=await answerBankWhatsAppMessage(user as never,"personal","both","Explique o que o Open Finance permite consultar na Zelo.","2026-10-16");
  expect(answer).toContain("saldos");expect(answer).toContain("empréstimos");expect(answer).toContain("movimentações");
  expect(answer).not.toContain("Contas → Conectar banco");
});
it("explains missing or unavailable data without claiming it was received",async()=>{
  const answer=await answerBankWhatsAppMessage(user as never,"personal","both","Quais dados a Zelo não recebe pelo Open Finance?","2026-10-16");
  expect(answer).toContain("senha");expect(answer).toContain("códigos");expect(answer).toContain("não informado");
  expect(answer).not.toContain("Contas → Conectar banco");
});
it("answers which bank connection is inactive from the selected mode without inventing status",async()=>{
  m.rpc.mockResolvedValue({connections:[
    {institution_name:"Banco Ativo",status:"active",archived_at:null},
    {institution_name:"Banco Inter PJ",status:"revoked",archived_at:"2026-10-10"},
    {institution_name:"Banco Expirado",status:"expired",archived_at:null},
  ],sync:[]});
  const answer=await answerBankWhatsAppMessage(user as never,"personal","both","Qual conexão bancária está inativa?","2026-10-16");
  expect(answer).toContain("Banco Inter PJ");expect(answer).toContain("Banco Expirado");
  expect(answer).not.toContain("Banco Ativo");expect(answer).toContain("histórico");
  expect(m.rpc).toHaveBeenCalledWith(expect.objectContaining({userId:user.id,mode:"personal"}),"zelo_of_overview",{p_environment:"production"});
});
it("does not query bank connection status outside the phone's permitted mode",async()=>{
  const answer=await answerBankWhatsAppMessage(user as never,"personal","personal","Qual conexão bancária está inativa na empresa?","2026-10-16");
  expect(answer).toContain("não tem acesso");expect(m.rpc).not.toHaveBeenCalled();
});
it("routes a personal-only overview without treating the excluded company as a second request",async()=>{
  const message="Mostre somente dados do modo Pessoal; não acesse a empresa.";
  expect(await answerBankWhatsAppMessage(user as never,"business","both",message,"2026-10-16")).toBeNull();
  const answer=await answerConnectedFinanceQuery(user,"business","both",{intent:"finance_query",confidence:1,mode:"personal"},["2026-10-01","2026-10-16"],message);
  expect(answer).not.toContain("Escolha um modo");
  expect(m.access).toHaveBeenCalledWith(expect.anything(),"personal",expect.anything());
});
it("answers future bank movement dates from stored movements without treating future due dates as errors",async()=>{
  m.ledger.mockResolvedValue({report:{movements:[{date:"2026-10-18",description:"Movimento futuro",institution_name:"Banco A",amount:"12",currency:"BRL"}],sync_pending:false},overview:{connections:[{status:"active"}]}});
  const answer=await answerBankWhatsAppMessage(user as never,"personal","both","Há datas bancárias que parecem estar no futuro?","2026-10-16");
  expect(answer).toContain("Movimento futuro");expect(answer).toContain("18/10/2026");
  expect(answer).not.toContain("fontes públicas");
  expect(answer).toContain("Datas de vencimentos futuros são esperadas");
  expect(m.ledger).toHaveBeenCalledWith(expect.objectContaining({userId:user.id,mode:"personal"}),expect.objectContaining({from:"2026-10-17"}));
});
it("does not refer to listed future movements when none were received",async()=>{
  m.ledger.mockResolvedValue({report:{movements:[],sync_pending:true},overview:{connections:[{status:"active"}]}});
  const answer=await answerBankWhatsAppMessage(user as never,"personal","both","Há datas bancárias que parecem estar no futuro?","2026-10-16");
  expect(answer).toContain("Nenhuma movimentação recebida");
  expect(answer).not.toContain("movimentação acima");
  expect(answer).toContain("sincronização");
});
it("answers due-today with only known dates in the selected mode",async()=>{
  m.financial.mockResolvedValue({commitments:[{id:"manual",mode:"personal",type:"expense",description:"Conta manual",amount:25,dueDate:"2026-10-16",origin:"scheduled"},{id:"other",mode:"business",type:"expense",description:"Outra empresa",amount:90,dueDate:"2026-10-16",origin:"scheduled"}],bank:{items:[{id:"bill",mode:"personal",kind:"bill",description:"Fatura",institution_name:"Banco A",resource_name:"Cartão",due_date:"2026-10-16",amount:"50",currency:"BRL"},{id:"estimate",mode:"personal",kind:"recurring",description:"Cobrança estimada",institution_name:"Banco B",resource_name:"Cartão",due_date:"2026-10-16",amount:"10",currency:"BRL"}],incomplete:true},forecasts:[],coverage:""});
  const answer=await answerBankWhatsAppMessage(user as never,"personal","both","O que vence hoje com data confirmada?","2026-10-16");
  expect(answer).toContain("Conta manual");expect(answer).toContain("Fatura");
  expect(answer).not.toContain("Outra empresa");expect(answer).not.toContain("Cobrança estimada");expect(answer).not.toContain("Resultado realizado");
  expect(answer).toContain("dados incompletos");
  expect(m.financial).toHaveBeenCalledWith(user,"personal",expect.objectContaining({from:"2026-10-16",to:"2026-10-16"}));
});
it("does not reveal company due dates to a personal-only phone",async()=>{
  const answer=await answerBankWhatsAppMessage(user as never,"personal","personal","O que vence hoje na empresa?","2026-10-16");
  expect(answer).toContain("não tem acesso");expect(m.financial).not.toHaveBeenCalled();
});
it("uses seven inclusive dates and separates dated bank estimates from manual bills",async()=>{
  m.financial.mockResolvedValue({commitments:[],bank:{items:[{id:"a",mode:"personal",kind:"recurring",description:"Via Laser",institution_name:"Mercado Pago",resource_name:"Cartão",due_date:"2026-10-20",amount:"89.90",currency:"BRL"}],incomplete:false},forecasts:[],coverage:""});
  const answer=await answerBankWhatsAppMessage(user as never,"personal","both","O que vence nos próximos sete dias?","2026-10-16");
  expect(answer).toContain("16/10/2026 a 22/10/2026");expect(answer).toContain("Via Laser");expect(answer).toContain("estimada");
  expect(answer).not.toContain("Não encontrei despesas");expect(answer).not.toContain("Resultado realizado");
  expect(m.financial).toHaveBeenCalledWith(user,"personal",expect.objectContaining({from:"2026-10-16",to:"2026-10-22"}));
});
it("lists undated bank installments without calling their payment future or confirmed",async()=>{
  m.financial.mockResolvedValue({commitments:[],bank:{items:[{id:"undated",mode:"personal",kind:"installment",description:"Compra parcelada",institution_name:"Banco A",resource_name:"Cartão",due_date:null,amount:"25",currency:"BRL"},{id:"dated",mode:"personal",kind:"recurring",description:"Assinatura",institution_name:"Banco A",resource_name:"Cartão",due_date:"2026-10-20",amount:"10",currency:"BRL"}],incomplete:false},forecasts:[],coverage:""});
  const answer=await answerBankWhatsAppMessage(user as never,"personal","both","Quais cobranças futuras não têm data informada?","2026-10-16");
  expect(answer).toContain("Compra parcelada");expect(answer).toContain("data não informada");expect(answer).toContain("não posso confirmar");
  expect(answer).not.toContain("Assinatura");expect(answer).not.toContain("Resultado realizado");
  expect(m.financial).toHaveBeenCalledWith(user,"personal",expect.objectContaining({includeUndated:true}));
});
it("reports only explicit bank payment evidence for forecasts",async()=>{
  m.agenda.mockResolvedValue({items:[{id:"paid",mode:"personal",kind:"bill",description:"Fatura A",institution_name:"Banco A",resource_name:"Cartão",due_date:"2026-10-18",amount:"100",currency:"BRL",payment_evidence:true,payment_amount:"40"},{id:"unknown",mode:"personal",kind:"recurring",description:"Via Laser",institution_name:"Banco B",resource_name:"Cartão",due_date:"2026-10-20",amount:"20",currency:"BRL",payment_evidence:false}],incomplete:false});
  const answer=await answerBankWhatsAppMessage(user as never,"personal","both","Alguma previsão já aparece como paga?","2026-10-16");
  expect(answer).toContain("Fatura A");expect(answer).toContain("pagamento informado");expect(answer?.replace(/\s/g," ")).toContain("R$ 40,00");
  expect(answer).not.toContain("Via Laser");expect(answer).not.toContain("totalmente quitada");
});
it("does not report zero paid forecasts without a bank connection",async()=>{
  m.access.mockResolvedValue(null);
  const answer=await answerBankWhatsAppMessage(user as never,"personal","both","Alguma previsão já aparece como paga?","2026-10-16");
  expect(answer).toContain("Não tenho dados de um banco conectado");expect(m.agenda).not.toHaveBeenCalled();
});
it("lists only dated future bank obligations without payment confirmation",async()=>{
  m.agenda.mockResolvedValue({items:[{id:"a",mode:"personal",kind:"bill",description:"Fatura",institution_name:"Banco A",resource_name:"Cartão",due_date:"2026-10-20",amount:"100",currency:"BRL",payment_evidence:false},{id:"b",mode:"personal",kind:"bill",description:"Paga",institution_name:"Banco B",resource_name:"Cartão",due_date:"2026-10-21",amount:"40",currency:"BRL",payment_evidence:true},{id:"c",mode:"personal",kind:"installment",description:"Sem data",institution_name:"Banco C",resource_name:"Cartão",due_date:null,amount:"20",currency:"BRL"}],incomplete:true});
  const answer=await answerBankWhatsAppMessage(user as never,"personal","both","Mostre apenas obrigações futuras ainda não confirmadas pelo banco.","2026-10-16");
  expect(answer).toContain("Fatura");expect(answer).toContain("Banco A");expect(answer).toContain("pagamento não confirmado");
  expect(answer).not.toContain("Paga");expect(answer).not.toContain("Sem data");expect(answer).toContain("dados incompletos");
});
it("states the queried bank statement interval without inventing an exact gap",async()=>{
  m.read.mockResolvedValue({entries:[],bank:{overview:{connections:[{}]},report:{from:"2026-10-01",to:"2026-10-16",history_complete:false,sync_pending:true,missing_dates:2,last_successful_sync_at:"2026-10-15T12:00:00Z"}}});
  const answer=await answerBankWhatsAppMessage(user as never,"personal","both","Qual período do meu extrato está incompleto?","2026-10-16");
  expect(answer).toContain("01/10/2026 a 16/10/2026");expect(answer).toContain("2 movimento");expect(answer).toContain("não consigo identificar os dias exatos");
  expect(answer).not.toContain("zero");
});
it("uses the active personal mode when the model guesses company for an unqualified category question",async()=>{
  const answer=await answerConnectedFinanceQuery(user,"personal","both",{intent:"finance_query",confidence:1,mode:"business",category:"Marketing",financeType:"expense"},["2026-10-01","2026-10-31"],"Quanto gastei em marketing neste mês?");
  expect(answer).toContain("Pessoal");expect(answer).not.toContain("🏢 Empresa");
  expect(m.read).toHaveBeenCalledWith(user,"personal","2026-10-01","2026-10-31");
});
it("honors an explicit company request even when the model guesses personal",async()=>{
  const answer=await answerConnectedFinanceQuery(user,"personal","both",{intent:"finance_query",confidence:1,mode:"personal",category:"Marketing",financeType:"expense"},["2026-10-01","2026-10-31"],"Quanto gastei em marketing na empresa neste mês?");
  expect(answer).toContain("Empresa");expect(m.read).toHaveBeenCalledWith(user,"business","2026-10-01","2026-10-31");
});
it("separates personal and business investment queries without mixing their positions",async()=>{
  m.bank.mockImplementation(async (_user:unknown,mode:string)=>mode==="personal"?"Pessoal: nenhum investimento informado.":"Empresa: posição bancária recebida.");
  const answer=await answerBankWhatsAppMessage(user as never,"personal","both","Separe investimento pessoal de investimento da empresa.","2026-10-15");
  expect(answer).toContain("Pessoal: nenhum investimento informado.");
  expect(answer).toContain("Empresa: posição bancária recebida.");
  expect(m.bank).toHaveBeenCalledWith(user,"personal",expect.any(String),"2026-10-15");
  expect(m.bank).toHaveBeenCalledWith(user,"business",expect.any(String),"2026-10-15");
  expect(await answerBankWhatsAppMessage(user as never,"personal","both","Mostre os investimentos pessoais separados dos investimentos da empresa.","2026-10-15")).toContain("As posições de Pessoal e Empresa não são somadas.");
});
it("explains cash versus invested value without treating one as the other",async()=>{
  const answer=await answerBankWhatsAppMessage(user as never,"personal","both","Explique a diferença entre dinheiro em conta e valor investido.","2026-10-15");
  expect(answer).toContain("conta");expect(answer).toContain("investimento");
  expect(answer).toContain("não são somados");
  expect(await answerBankWhatsAppMessage(user as never,"personal","both","Qual a diferença entre saldo da conta e investimento?","2026-10-15")).toContain("investimento");
});
it("separates loans from financings using two scoped bank queries",async()=>{
  m.bank.mockImplementation(async (_user:unknown,_mode:string,question:string)=>question.includes("empréstimos")?"Empréstimos: contrato A.":"Financiamentos: contrato B.");
  const answer=await answerBankWhatsAppMessage(user as never,"personal","both","Separe empréstimos de financiamentos.","2026-10-15");
  expect(answer).toContain("Empréstimos: contrato A.");expect(answer).toContain("Financiamentos: contrato B.");
  expect(m.bank).toHaveBeenCalledTimes(2);
});
it("does not treat a bank-reported zero loan balance as proof of discharge",async()=>{
  const answer=await answerBankWhatsAppMessage(user as never,"personal","both","Explique se saldo zero prova quitação do empréstimo.","2026-10-15");
  expect(answer).toContain("não prova quitação");
  expect(answer).toContain("banco");
});
it("answers unconfirmed bank installments with a count and a few examples, without calling them overdue",async()=>{
  const items=Array.from({length:8},(_,index)=>({id:`item-${index}`,mode:"personal",kind:"installment",description:`Compra ${index}`,resource_name:"Cartão",institution_name:"Banco",due_date:null,amount:"20",currency:"BRL",payment_evidence:index===2,synced_at:"2026-10-15"}));
  m.agenda.mockResolvedValue({items,incomplete:true});
  const answer=await answerBankWhatsAppMessage(user as never,"personal","both","Quais parcelas não têm confirmação de pagamento?","2026-10-15");
  expect(answer).toContain("7 parcelas");
  expect(answer).toContain("Compra 0");
  expect(answer).toContain(bankMoney("20","BRL"));
  expect(answer).not.toContain("Compra 2");
  expect(answer).not.toContain("Compra 7");
  expect(answer).toContain("não confirma que estão em aberto");
  expect(answer).toContain("dados bancários incompletos");
  expect(m.agenda).toHaveBeenCalledWith(user,"personal",expect.objectContaining({includeUndated:true}));
});
it("does not turn missing bank access into a claim that there are no unconfirmed installments",async()=>{
  m.access.mockResolvedValue(null);
  const answer=await answerBankWhatsAppMessage(user as never,"personal","both","Quais parcelas não têm confirmação de pagamento?","2026-10-15");
  expect(answer).toContain("não está disponível");
  expect(answer).not.toContain("0 parcelas");
  expect(m.agenda).not.toHaveBeenCalled();
});
it("uses the requested previous month and the own connected ledger",async()=>{
  const answer=await answerConnectedFinanceQuery(user,"personal","both",{intent:"finance_query",confidence:1,period:{from:"2026-09-01",to:"2026-09-30"}},["2026-10-01","2026-10-31"]);
  expect(answer).toContain("R$ 35,00");expect(answer).toContain("01/09/2026");expect(m.read).toHaveBeenCalledWith(user,"personal","2026-09-01","2026-09-30");
});
it("includes manual and bank entries in a general financial result",async()=>{
  m.read.mockResolvedValue({entries:[
    {id:"bank-income",mode:"personal",included:true,source:"bank",date:"2026-09-10",type:"income",category:"Outros",description:"Crédito bancário",amount:100},
    {id:"manual-expense",mode:"personal",included:true,source:"whatsapp",date:"2026-09-11",type:"expense",category:"Saúde",description:"Farmácia",amount:35},
  ],bank:{overview:{connections:[{}]},report:{sync_pending:false,missing_dates:0,last_successful_sync_at:"2026-10-16"}}});
  const reply=await answerConnectedFinanceQuery(user,"personal","both",{intent:"finance_query",confidence:1,period:{from:"2026-09-01",to:"2026-09-30"}},["2026-10-01","2026-10-31"],"Qual foi meu resultado financeiro no mês passado?");
  expect(reply).toContain(`Entradas: ${bankMoney(100,"BRL")}`);
  expect(reply).toContain(`Saídas: ${bankMoney(35,"BRL")}`);
  expect(reply).toContain(`Resultado do período: ${bankMoney(65,"BRL")}`);
  expect(reply).not.toContain("registros manuais ficam fora");
});
it("returns both directions for a requested monthly summary",async()=>{
  m.read.mockResolvedValue({entries:[
    {id:"income",mode:"personal",included:true,source:"bank",date:"2026-09-10",type:"income",category:"Outros",description:"Recebimento",amount:100},
    {id:"expense",mode:"personal",included:true,source:"bank",date:"2026-09-11",type:"expense",category:"Outros",description:"Compra",amount:35},
  ],bank:{overview:{connections:[{}]},report:{sync_pending:false,missing_dates:0,last_successful_sync_at:"2026-10-16"}}});
  const reply=await answerConnectedFinanceQuery(user,"personal","both",{intent:"finance_query",confidence:1,financeType:"expense",period:{from:"2026-09-01",to:"2026-09-30"}},["2026-10-01","2026-10-31"],"Me dê um resumo de setembro sem trazer itens de outubro.");
  expect(reply).toContain(`Entradas: ${bankMoney(100,"BRL")}`);
  expect(reply).toContain(`Saídas: ${bankMoney(35,"BRL")}`);
  expect(reply).toContain(`Resultado do período: ${bankMoney(65,"BRL")}`);
});
it("compares this week with the previous week instead of returning only one period",async()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date("2026-10-16T15:00:00Z"));
  try{
    m.read.mockImplementation(async(_user:unknown,_mode:string,from:string)=>({entries:from==="2026-10-12"
      ?[{id:"current",mode:"personal",included:true,source:"bank",date:"2026-10-14",type:"expense",category:"Outros",description:"Atual",amount:80}]
      :[{id:"previous",mode:"personal",included:true,source:"bank",date:"2026-10-07",type:"expense",category:"Outros",description:"Anterior",amount:100}],bank:{overview:{connections:[{}]},report:{sync_pending:false,missing_dates:0,last_successful_sync_at:"2026-10-16"}}}));
    const reply=await answerConnectedFinanceQuery(user,"personal","both",{intent:"finance_analysis",confidence:1,period:{from:"2026-10-05",to:"2026-10-11"}},["2026-10-01","2026-10-31"],"Compare o gasto desta semana com a semana anterior.");
    expect(reply).toContain("12/10/2026 a 16/10/2026");expect(reply).toContain("05/10/2026 a 09/10/2026");
    expect(reply).toContain(bankMoney(80,"BRL"));expect(reply).toContain(bankMoney(100,"BRL"));
    expect(reply).toContain("R$ 20,00 a menos");
    expect(m.read).toHaveBeenCalledWith(user,"personal","2026-10-12","2026-10-16");
    expect(m.read).toHaveBeenCalledWith(user,"personal","2026-10-05","2026-10-11");
  }finally{vi.useRealTimers();}
});
it("compares this month's income with last month's, showing comparable and full periods",async()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date("2026-10-16T15:00:00Z"));
  try{
    m.read.mockImplementation(async(_user:unknown,_mode:string,from:string)=>({entries:from==="2026-10-01"
      ?[{id:"current",mode:"personal",included:true,source:"bank",date:"2026-10-10",type:"income",category:"Outros",description:"Atual",amount:60}]
      :[{id:"previous",mode:"personal",included:true,source:"bank",date:"2026-09-10",type:"income",category:"Outros",description:"Anterior",amount:100},{id:"late",mode:"personal",included:true,source:"bank",date:"2026-09-29",type:"income",category:"Outros",description:"Fim do mês",amount:50}],bank:{overview:{connections:[{}]},report:{sync_pending:false,missing_dates:0,last_successful_sync_at:"2026-10-16"}}}));
    const reply=await answerConnectedFinanceQuery(user,"personal","both",{intent:"finance_query",confidence:1,financeType:"income",period:{from:"2026-09-01",to:"2026-09-30"}},["2026-10-01","2026-10-31"],"Compare as entradas deste mês com as do mês passado.");
    expect(reply).toContain("01/10/2026 a 16/10/2026");expect(reply).toContain("01/09/2026 a 16/09/2026");
    expect(reply).toContain(bankMoney(60,"BRL"));expect(reply).toContain(bankMoney(100,"BRL"));expect(reply).toContain(bankMoney(150,"BRL"));
    expect(reply).toContain("R$ 40,00 a menos");
  }finally{vi.useRealTimers();}
});
it("lists the five largest posted entries in the requested direction",async()=>{
  m.read.mockResolvedValue({entries:[
    ...[10,90,40,70,30,50].map((amount,index)=>({id:`expense-${index}`,mode:"personal",included:true,source:"bank",date:"2026-10-10",type:"expense",category:"Outros",description:`Gasto ${index}`,amount})),
    {id:"pending",mode:"personal",included:false,status:"pending",source:"web",date:"2026-10-10",type:"expense",category:"Outros",description:"Pendente",amount:999},
    {id:"business",mode:"business",included:true,source:"bank",date:"2026-10-10",type:"expense",category:"Outros",description:"Outra empresa",amount:888},
    {id:"income",mode:"personal",included:true,source:"bank",date:"2026-10-11",type:"income",category:"Outros",description:"Salário",amount:200},
  ],bank:{overview:{connections:[{}]},report:{sync_pending:false,missing_dates:0,last_successful_sync_at:"2026-10-16"}}});
  const expenses=await answerConnectedFinanceQuery(user,"personal","both",{intent:"finance_query",confidence:1,financeType:"expense"},["2026-10-01","2026-10-31"],"Quais foram as cinco maiores despesas deste mês?");
  expect(expenses).toContain("Gasto 1");expect(expenses).toContain("Gasto 3");expect(expenses).toContain("Gasto 5");expect(expenses).toContain("Gasto 2");expect(expenses).toContain("Gasto 4");
  expect(expenses).not.toContain("Gasto 0");expect(expenses).not.toContain("Pendente");expect(expenses).not.toContain("Outra empresa");expect(expenses).not.toContain("Salário");
  const income=await answerConnectedFinanceQuery(user,"personal","both",{intent:"finance_query",confidence:1,financeType:"income"},["2026-10-01","2026-10-31"],"Quais foram as cinco maiores receitas deste mês?");
  expect(income).toContain("Salário");expect(income).not.toContain("Gasto 1");
});
it("answers five recent movements with both directions and no sixth item",async()=>{
  m.read.mockResolvedValue({entries:[
    {id:"sixth",mode:"personal",source:"web",date:"2026-10-09",type:"expense",description:"Sexto",amount:6,category:"Outros",included:true},
    {id:"credit",mode:"personal",source:"bank",date:"2026-10-15",type:"income",description:"Receita recente",amount:50,category:"Outros",included:true,bank:{resource_type:"account",institution_name:"Banco A",amount:"50",currency:"BRL",direction:"credit"}},
    {id:"transfer",mode:"personal",source:"bank",date:"2026-10-14",type:"expense",description:"Transferência própria",amount:40,category:"Transferência entre contas próprias",included:false,bank:{resource_type:"account",institution_name:"Banco B",amount:"40",currency:"BRL",direction:"debit"}},
    {id:"debit",mode:"personal",source:"bank",date:"2026-10-13",type:"expense",description:"Compra recente",amount:30,category:"Alimentação",included:true,bank:{resource_type:"card",institution_name:"Banco C",amount:"30",currency:"BRL",direction:"debit"}},
    {id:"manual",mode:"personal",source:"web",date:"2026-10-12",type:"income",description:"Registro manual",amount:20,category:"Outros",included:true},
    {id:"fifth",mode:"personal",source:"web",date:"2026-10-11",type:"expense",description:"Quinto",amount:10,category:"Outros",included:true},
    {id:"pending",mode:"personal",source:"web",date:"2026-10-15",type:"expense",description:"Pendente",amount:9,category:"Outros",status:"pending",included:false},
    {id:"foreign",mode:"business",source:"web",date:"2026-10-15",type:"expense",description:"Outra empresa",amount:9,category:"Outros",included:true},
  ],bank:{overview:{connections:[{}]},report:{sync_pending:true,missing_dates:0,last_successful_sync_at:"2026-10-15"}}});
  const answer=await answerBankWhatsAppMessage(user as never,"personal","both","Quais foram minhas cinco movimentações mais recentes?","2026-10-15");
  expect(answer).toContain("Receita recente");expect(answer).toContain("Transferência própria");expect(answer).toContain("Compra recente");
  expect(answer).toContain("Registro manual");expect(answer).toContain("Quinto");
  expect(answer).not.toContain("Sexto");expect(answer).not.toContain("Pendente");expect(answer).not.toContain("Outra empresa");
  expect(answer).toContain("Não altera o resultado");expect(answer).toContain("importação");
  expect(m.read).toHaveBeenCalledWith(user,"personal",expect.any(String),"2026-10-15");
});
it("does not label a movement with missing bank amount as a confirmed transfer",async()=>{
  m.read.mockResolvedValue({entries:[{id:"unknown",mode:"personal",source:"bank",date:"2026-10-15",type:"expense",description:"Valor não recebido",amount:0,category:"Outros",included:false,bank:{resource_type:"account",institution_name:"Banco A",amount:null,currency:"BRL",direction:"debit"}}],bank:null});
  const answer=await answerBankWhatsAppMessage(user as never,"personal","both","Quais foram minhas cinco movimentações mais recentes?","2026-10-15");
  expect(answer).toContain("Valor não recebido");expect(answer).toContain("Não informado");
  expect(answer).not.toContain("R$ 0,00");expect(answer).not.toContain("Não altera o resultado");
});
it("keeps weekly account totals separate from card purchases",async()=>{
  m.read.mockResolvedValue({entries:[
    {id:"account-credit",mode:"personal",source:"bank",date:"2026-10-14",type:"income",amount:70,description:"Crédito",category:"Outros",included:true,bank:{resource_type:"account",institution_name:"Banco A",direction:"credit",amount:"70",currency:"BRL"}},
    {id:"account-debit",mode:"personal",source:"bank",date:"2026-10-14",type:"expense",amount:20,description:"Débito",category:"Outros",included:true,bank:{resource_type:"account",institution_name:"Banco A",direction:"debit",amount:"20",currency:"BRL"}},
    {id:"card",mode:"personal",source:"bank",date:"2026-10-14",type:"expense",amount:90,description:"Compra",category:"Outros",included:true,bank:{resource_type:"card",institution_name:"Banco B",direction:"debit",amount:"90",currency:"BRL"}},
  ],bank:{overview:{connections:[{}]},report:{sync_pending:false,missing_dates:0,last_successful_sync_at:"2026-10-15"}}});
  const incoming=await answerBankWhatsAppMessage(user as never,"personal","both","Quanto entrou na conta nesta semana?","2026-10-15");
  const outgoing=await answerBankWhatsAppMessage(user as never,"personal","both","Quanto saiu das contas nesta semana?","2026-10-15");
  const split=await answerBankWhatsAppMessage(user as never,"personal","both","Separe movimentações de conta e de cartão nos últimos sete dias.","2026-10-15");
  expect(incoming).toContain("R$ 70,00");expect(outgoing).toContain("R$ 20,00");expect(outgoing).not.toContain("R$ 90,00");
  expect(split).toContain("Contas bancárias");expect(split).toContain("Cartões");expect(split).toContain("R$ 90,00");
});
it("filters card purchases, bill payments, own transfers and Pix direction",async()=>{
  m.read.mockResolvedValue({entries:[
    {id:"purchase",mode:"personal",source:"bank",date:"2026-10-13",type:"expense",amount:35,description:"Padaria",category:"Alimentação",included:true,bank:{resource_type:"card",institution_name:"Banco A",direction:"debit",amount:"35",currency:"BRL"}},
    {id:"payment",mode:"personal",source:"bank",date:"2026-10-13",type:"expense",amount:500,description:"DEBITO AUT. FAT.CARTAO MASTER CARD FINAL 6129",category:"Transferências e pagamentos",categorySource:"excluded",included:false,bank:{resource_type:"account",institution_name:"Banco A",direction:"debit",amount:"500",currency:"BRL"}},
    {id:"own-debit",mode:"personal",source:"bank",date:"2026-10-02",type:"expense",amount:100,description:"Transferência enviada pelo Pix|Samira",category:"Transferência entre contas próprias",categorySource:"excluded",included:false,bank:{resource_type:"account",institution_name:"Banco A",direction:"debit",amount:"100",currency:"BRL"}},
    {id:"own-credit",mode:"personal",source:"bank",date:"2026-10-02",type:"income",amount:100,description:"PIX RECEBIDO Samira",category:"Transferência entre contas próprias",categorySource:"excluded",included:false,bank:{resource_type:"account",institution_name:"Banco B",direction:"credit",amount:"100",currency:"BRL"}},
    {id:"third-party",mode:"personal",source:"bank",date:"2026-10-03",type:"expense",amount:22,description:"Pix para terceiro",category:"Outros",included:true,bank:{resource_type:"account",institution_name:"Banco A",direction:"debit",amount:"22",currency:"BRL"}},
  ],bank:{overview:{connections:[{}]},report:{sync_pending:false,missing_dates:0,last_successful_sync_at:"2026-10-15"}}});
  const purchases=await answerBankWhatsAppMessage(user as never,"personal","both","Mostre compras de cartão do mês sem pagamentos de fatura.","2026-10-15");
  const payments=await answerBankWhatsAppMessage(user as never,"personal","both","Encontre pagamentos de fatura do mês e diga se ficaram fora dos gastos.","2026-10-15");
  const own=await answerBankWhatsAppMessage(user as never,"personal","both","Encontre transferências entre minhas próprias contas no mês.","2026-10-15");
  const sent=await answerBankWhatsAppMessage(user as never,"personal","both","Quais Pix enviados aparecem no extrato deste mês?","2026-10-15");
  const received=await answerBankWhatsAppMessage(user as never,"personal","both","Quais Pix recebidos aparecem no extrato deste mês?","2026-10-15");
  expect(purchases).toContain("Padaria");expect(purchases).not.toContain("DEBITO AUT");
  expect(payments).toContain("DEBITO AUT");expect(payments).toContain("Fora dos totais");expect(payments).not.toContain("Padaria");
  expect(own).toContain("Transferência enviada pelo Pix|Samira");expect(own).toContain("PIX RECEBIDO Samira");expect(own).not.toContain("terceiro");
  expect(sent).toContain("Pix para terceiro");expect(sent).toContain("Transferência enviada pelo Pix|Samira");expect(sent).not.toContain("PIX RECEBIDO Samira");
  expect(received).toContain("PIX RECEBIDO Samira");expect(received).not.toContain("Pix para terceiro");
});
it("reports only missing bank amounts and does not invent dates or zero",async()=>{
  m.read.mockResolvedValue({entries:[
    {id:"missing",mode:"personal",source:"bank",date:"2026-10-12",type:"expense",amount:0,description:"Sem valor",category:"Outros",included:false,bank:{resource_type:"account",institution_name:"Banco A",direction:"debit",amount:null,currency:"BRL"}},
    {id:"known",mode:"personal",source:"bank",date:"2026-10-12",type:"expense",amount:42,description:"Valor conhecido",category:"Outros",included:true,bank:{resource_type:"account",institution_name:"Banco A",direction:"debit",amount:"42",currency:"BRL"}},
  ],bank:{overview:{connections:[{}]},report:{sync_pending:true,missing_dates:2,last_successful_sync_at:"2026-10-15"}}});
  const amounts=await answerBankWhatsAppMessage(user as never,"personal","both","Quais lançamentos do extrato não têm valor informado?","2026-10-15");
  const dates=await answerBankWhatsAppMessage(user as never,"personal","both","Quais lançamentos não têm data informada?","2026-10-15");
  expect(amounts).toContain("Sem valor");expect(amounts).toContain("Não informado");expect(amounts).not.toContain("Valor conhecido");
  expect(dates).toContain("2 movimento(s) sem data");expect(dates).not.toContain("Valor conhecido");
});
it("separates explicit card refunds from income without mistaking a bill payment for a refund",async()=>{
  m.read.mockResolvedValue({entries:[
    {id:"refund",mode:"personal",source:"bank",date:"2026-10-13",type:"expense",amount:-40,description:"Estorno da compra na loja",category:"Outros",included:true,bank:{resource_type:"card",institution_name:"Banco A",direction:"credit",classification:"refund",amount:"40",currency:"BRL"}},
    {id:"bill",mode:"personal",source:"bank",date:"2026-10-13",type:"expense",amount:-80,description:"DEB. AUTOM. DE FATURA EM C/C",category:"Transferências e pagamentos",included:false,bank:{resource_type:"card",institution_name:"Banco A",direction:"credit",classification:"bill_payment",amount:"80",currency:"BRL"}},
    {id:"income",mode:"personal",source:"bank",date:"2026-10-13",type:"income",amount:100,description:"Salário",category:"Outros",included:true,bank:{resource_type:"account",institution_name:"Banco A",direction:"credit",amount:"100",currency:"BRL"}},
    {id:"other",mode:"business",source:"bank",date:"2026-10-13",type:"expense",amount:-500,description:"Estorno de outra empresa",category:"Outros",included:true,bank:{resource_type:"card",institution_name:"Banco B",direction:"credit",classification:"refund",amount:"500",currency:"BRL"}},
  ],bank:{overview:{connections:[{}]},report:{sync_pending:false,missing_dates:0,last_successful_sync_at:"2026-10-15"}}});
  const answer=await answerBankWhatsAppMessage(user as never,"personal","both","Mostre estornos de cartão separados das receitas.","2026-10-15");
  expect(answer).toContain("Estornos de cartão");expect(answer).toContain("Estorno da compra na loja");expect(answer).toContain("R$ 40,00");
  expect(answer).toContain("Receitas realizadas sem estornos");expect(answer).toContain("R$ 100,00");
  expect(answer).not.toContain("DEB. AUTOM");expect(answer).not.toContain("outra empresa");
});
it("does not turn an unknown card credit into a confirmed refund or claim the full month was zero",async()=>{
  m.read.mockResolvedValue({entries:[
    {id:"unknown",mode:"personal",source:"bank",date:"2026-10-13",type:"expense",amount:-25,description:"CRÉDITO CARTÃO",category:"Outros",included:true,bank:{resource_type:"card",institution_name:"Banco A",direction:"credit",classification:"unknown",amount:"25",currency:"BRL"}},
  ],bank:{overview:{connections:[{}]},report:{sync_pending:true,missing_dates:0,last_successful_sync_at:"2026-10-15"}}});
  const answer=await answerBankWhatsAppMessage(user as never,"personal","both","Mostre estornos de cartão separados das receitas.","2026-10-15");
  expect(answer).toContain("Nenhum estorno de cartão identificado");expect(answer).toContain("crédito de cartão sem identificação");
  expect(answer).not.toContain("CRÉDITO CARTÃO");expect(answer).not.toContain("Entradas: R$ 0,00");
});
it("does not claim zero account movement without a connected bank",async()=>{
  m.read.mockResolvedValue({entries:[],bank:null});
  const answer=await answerBankWhatsAppMessage(user as never,"personal","both","Quanto saiu das contas nesta semana?","2026-10-15");
  expect(answer).toContain("Não tenho dados de um banco conectado");expect(answer).not.toContain("R$ 0,00");
});
it("lists same-day, same-value review candidates without calling them duplicates",async()=>{
  m.read.mockResolvedValue({entries:[
    {id:"a",mode:"personal",source:"bank",date:"2026-10-11",type:"expense",amount:45,description:"Loja A",category:"Outros",included:true,bank:{resource_type:"card",institution_name:"Banco A",direction:"debit",amount:"45",currency:"BRL"}},
    {id:"b",mode:"personal",source:"bank",date:"2026-10-11",type:"expense",amount:45,description:"Loja B",category:"Outros",included:true,bank:{resource_type:"card",institution_name:"Banco B",direction:"debit",amount:"45",currency:"BRL"}},
    {id:"transfer",mode:"personal",source:"bank",date:"2026-10-11",type:"expense",amount:45,description:"Transferência própria",category:"Transferência entre contas próprias",included:false,bank:{resource_type:"account",institution_name:"Banco A",direction:"debit",amount:"45",currency:"BRL"}},
    {id:"other",mode:"business",source:"bank",date:"2026-10-11",type:"expense",amount:45,description:"Outra empresa",category:"Outros",included:true,bank:{resource_type:"card",institution_name:"Banco A",direction:"debit",amount:"45",currency:"BRL"}},
  ],bank:{overview:{connections:[{}]},report:{sync_pending:false,missing_dates:0,last_successful_sync_at:"2026-10-15"}}});
  const answer=await answerBankWhatsAppMessage(user as never,"personal","both","Há lançamentos com a mesma data e valor que precisam de conferência?","2026-10-15");
  expect(answer).toContain("Loja A");expect(answer).toContain("Loja B");
  expect(answer).not.toContain("Transferência própria");expect(answer).not.toContain("Outra empresa");
  expect(answer).toContain("não prova duplicação");
});
it("includes received bills and explicit subscription estimates outside the realized expense total",async()=>{
  m.agenda.mockResolvedValue({items:[{id:"s",mode:"personal",kind:"recurring",description:"Streaming",resource_name:"Card",institution_name:"Bank",due_date:"2026-10-15",amount:"40",currency:"BRL",synced_at:"2026-10-11T10:00:00Z"}],incomplete:false});
  const answer=await answerConnectedFinanceQuery(user,"personal","both",{intent:"finance_detail",confidence:1},["2026-10-01","2026-10-31"]);
  expect(answer).toContain("cobrança prevista");expect(answer).toContain("não foram somadas");expect(answer).toContain("Streaming");
});
it("does not read another mode, disabled feature or a person-specific query",async()=>{
  expect(await answerConnectedFinanceQuery(user,"personal","personal",{intent:"finance_query",confidence:1,mode:"business"},["2026-10-01","2026-10-31"])).toContain("não tem acesso");
  expect(await answerConnectedFinanceQuery(user,"personal","both",{intent:"finance_query",confidence:1,personName:"Another"},["2026-10-01","2026-10-31"])).toBeNull();
  vi.stubEnv("OPEN_FINANCE_WHATSAPP_ENABLED","false");
  expect(await answerConnectedFinanceQuery(user,"personal","both",{intent:"finance_query",confidence:1},["2026-10-01","2026-10-31"])).toBeNull();
  expect(m.read).not.toHaveBeenCalled();
});
it("does not invent a zero total when the bank ledger is unavailable",async()=>{
  m.read.mockRejectedValue(Error("private database details"));
  const answer=await answerConnectedFinanceQuery(user,"personal","both",{intent:"finance_query",confidence:1},["2026-10-01","2026-10-31"]);
  expect(answer).toContain("Não consegui consultar");expect(answer).not.toContain("R$");expect(answer).not.toContain("private");
});
it("keeps upcoming items inside the requested category and omits them for bank-only sources",async()=>{
  m.pending.mockResolvedValue([
    {id:"rent",mode:"personal",status:"pending",type:"expense",amount:800,date:"2026-09-20",description:"Rent",category:"Moradia"},
    {id:"food",mode:"personal",status:"pending",type:"expense",amount:30,date:"2026-09-20",description:"Food",category:"Alimentação"},
  ]);
  m.recurring.mockResolvedValue([{id:"gym",mode:"personal",status:"active",type:"expense",amount:90,nextDueDate:"2026-09-20",description:"Gym",category:"Saúde"}]);
  const ai={intent:"finance_detail",confidence:1,category:"Alimentação"} as const;
  const answer=await answerConnectedFinanceQuery(user,"personal","both",ai,["2026-09-01","2026-09-30"]);
  expect(answer).toContain("Food");expect(answer).not.toContain("Rent");expect(answer).not.toContain("Gym");
  const cards=await answerConnectedFinanceQuery(user,"personal","both",ai,["2026-09-01","2026-09-30"],"detalhe meus gastos no cartão");
  expect(cards).not.toContain("Valores ainda");expect(cards).not.toContain("Food");
});
it("gives a complete monthly overview without presenting undated old installments as upcoming",async()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date("2026-10-14T15:00:00Z"));
  try {
    m.read.mockResolvedValue({entries:[
      {id:"income",mode:"personal",included:true,source:"bank",date:"2026-10-05",type:"income",category:"Outros",description:"Recebimento",amount:1000,bank:{resource_type:"account"}},
      {id:"expense",mode:"personal",included:true,source:"bank",date:"2026-10-06",type:"expense",category:"Alimentação",description:"Mercado",amount:200,bank:{resource_type:"card"}},
    ],bank:{overview:{connections:[{}]},report:{sync_pending:false,missing_dates:0,last_successful_sync_at:"2026-10-14"}}});
    m.pending.mockResolvedValue([{id:"future",mode:"personal",status:"pending",type:"expense",amount:80,date:"2026-10-20",description:"Internet",category:"Serviços"}]);
    m.agenda.mockResolvedValue({items:[
      {id:"old",mode:"personal",kind:"installment",description:"Óticas Fam",resource_name:"Card",institution_name:"Bank",due_date:null,amount:"40",currency:null,synced_at:"2026-10-11"},
      {id:"bill",mode:"personal",kind:"bill",description:"Fatura",resource_name:"Card",institution_name:"Bank",due_date:"2026-10-25",amount:"100",currency:"BRL",synced_at:"2026-10-11"},
    ],incomplete:false});
    const answer=await answerConnectedFinanceQuery(user,"personal","both",{intent:"finance_detail",confidence:1},["2026-10-01","2026-10-31"],"Me dê um resumo detalhado do meu mês: receitas, despesas, saldo, categorias, maiores gastos e próximos vencimentos.");
    expect(answer).toContain("Entradas");expect(answer).toContain("Saídas");expect(answer).toContain("Resultado do período");
    expect(answer).toContain("Alimentação");expect(answer).toContain("Mercado");expect(answer).toContain("Internet");expect(answer).toContain("25/10/2026");
    expect(answer).not.toContain("Óticas Fam");expect(answer).not.toContain("Movimentações encontradas");
  } finally { vi.useRealTimers(); }
});
it("answers future card bills and installments from dated bank items without claiming payment",async()=>{
  m.agenda.mockResolvedValue({items:[
    {id:"bill",kind:"bill",description:"Fatura teste",resource_name:"Gold",institution_name:"Banco teste",due_date:"2026-10-20",amount:"100",currency:"BRL",synced_at:"2026-10-14"},
    {id:"installment",kind:"installment",description:"Compra teste",resource_name:"Gold",institution_name:"Banco teste",due_date:"2026-10-22",amount:"30",currency:"BRL",synced_at:"2026-10-14"},
    {id:"old",kind:"installment",description:"Óticas Fam",resource_name:"Gold",institution_name:"Banco teste",due_date:null,amount:"40",currency:"BRL",synced_at:"2026-10-14"},
  ],incomplete:false});
  const bills=await answerBankWhatsAppMessage(user as never,"personal","both","Quais faturas dos meus cartões pessoais vencem nos próximos 30 dias? Separe por banco e diga se o pagamento já foi confirmado.","2026-10-14");
  expect(bills).toContain("Faturas recebidas");expect(bills).not.toContain("Compra teste");expect(bills).toContain("pagamento não confirmado");
  const installments=await answerBankWhatsAppMessage(user as never,"personal","both","Quais parcelas do cartão vencem nos próximos 30 dias? Diga o valor e o cartão de cada uma.","2026-10-14");
  expect(installments).toContain("Compra teste");expect(installments).not.toContain("Óticas Fam");expect(installments).not.toContain("Faturas recebidas");
  const open=await answerBankWhatsAppMessage(user as never,"personal","both","Quanto devo em faturas de cartão que ainda estão abertas neste mês? Separe por banco.","2026-10-14");
  expect(open).toContain("Faturas recebidas");expect(open).toContain("Não posso confirmar o total ainda em aberto");
});
it("respects a seven-day bill window instead of interpreting the sentence as a bank name",async()=>{
  m.agenda.mockResolvedValue({items:[
    {id:"near",kind:"bill",description:"Fatura próxima",resource_name:"Gold",institution_name:"Banco A",due_date:"2026-10-19",amount:"100",currency:"BRL",synced_at:"2026-10-14"},
    {id:"far",kind:"bill",description:"Fatura distante",resource_name:"Gold",institution_name:"Banco B",due_date:"2026-10-28",amount:"200",currency:"BRL",synced_at:"2026-10-14"},
  ],incomplete:false});
  const answer=await answerBankWhatsAppMessage(user as never,"personal","both","Quais faturas dos meus cartões vencem nos próximos 7 dias? Diga o valor, o banco e a data.","2026-10-14");
  expect(answer).toContain("Banco A");expect(answer).not.toContain("Banco B");
  expect(m.agenda).toHaveBeenCalledWith(user,"personal",{from:"2026-10-14",to:"2026-10-21",includeUndated:false});
});
it("does not present past bills as still open this month without payment status",async()=>{
  m.agenda.mockResolvedValue({items:[
    {id:"past",kind:"bill",description:"Fatura antiga",resource_name:"Gold",institution_name:"Banco A",due_date:"2026-10-02",amount:"100",currency:"BRL",synced_at:"2026-10-14"},
    {id:"future",kind:"bill",description:"Fatura futura",resource_name:"Gold",institution_name:"Banco B",due_date:"2026-10-20",amount:"200",currency:"BRL",synced_at:"2026-10-14"},
  ],incomplete:false});
  const answer=await answerBankWhatsAppMessage(user as never,"personal","both","Quanto devo em faturas de cartão que ainda estão abertas neste mês? Separe por banco.","2026-10-15");
  expect(answer).toContain("Banco B");
  expect(answer).not.toContain("Banco A");
  expect(answer).toContain("Não posso confirmar o total ainda em aberto");
  expect(m.agenda).toHaveBeenCalledWith(user,"personal",{from:"2026-10-15",to:"2026-10-31",includeUndated:false});
});
it("does not claim a paid or unpaid amount from only past-due invoices",async()=>{
  m.agenda.mockResolvedValue({items:[
    {id:"past",kind:"bill",description:"Fatura antiga",resource_name:"Gold",institution_name:"Banco A",due_date:"2026-10-02",amount:"100",currency:"BRL",synced_at:"2026-10-14"},
  ],incomplete:true});
  const answer=await answerBankWhatsAppMessage(user as never,"personal","both","Quanto devo em faturas de cartão que ainda estão abertas neste mês?","2026-10-15");
  expect(answer).not.toContain("Banco A");
  expect(answer).toContain("Não posso confirmar se faturas já vencidas continuam em aberto");
  expect(answer).toContain("consulta bancária está incompleta");
});
it("answers the largest single expense instead of the largest spending category",async()=>{
  m.read.mockResolvedValue({entries:[
    {id:"food-a",mode:"personal",included:true,source:"bank",date:"2026-10-05",type:"expense",category:"Alimentação",description:"Mercado A",amount:60,bank:{resource_type:"card"}},
    {id:"food-b",mode:"personal",included:true,source:"bank",date:"2026-10-06",type:"expense",category:"Alimentação",description:"Mercado B",amount:60,bank:{resource_type:"card"}},
    {id:"single",mode:"personal",included:true,source:"bank",date:"2026-10-07",type:"expense",category:"Saúde",description:"Consulta médica",amount:100,bank:{resource_type:"account"}},
  ],bank:{overview:{connections:[{}]},report:{sync_pending:false,missing_dates:0,last_successful_sync_at:"2026-10-14"}}});
  const answer=await answerConnectedFinanceQuery(user,"personal","both",{intent:"finance_analysis",confidence:1},["2026-10-01","2026-10-31"],"Qual foi meu maior gasto neste mês no modo pessoal? Diga a data e a categoria.");
  expect(answer).toContain("Consulta médica");expect(answer).toContain("07/10/2026");expect(answer).toContain("Saúde");
  expect(answer).not.toContain("Maior categoria");
});
it("groups income by category instead of listing transactions when asked for a breakdown",async()=>{
  m.read.mockResolvedValue({entries:[
    {id:"i1",mode:"personal",included:true,source:"bank",date:"2026-09-05",type:"income",category:"Salário",description:"Recebimento A",amount:100,bank:{resource_type:"account"}},
    {id:"i2",mode:"personal",included:true,source:"bank",date:"2026-09-06",type:"income",category:"Salário",description:"Recebimento B",amount:50,bank:{resource_type:"account"}},
    {id:"i3",mode:"personal",included:true,source:"bank",date:"2026-09-07",type:"income",category:"Rendimentos",description:"Juros",amount:20,bank:{resource_type:"account"}},
  ],bank:{overview:{connections:[{}]},report:{sync_pending:false,missing_dates:0,last_successful_sync_at:"2026-10-14"}}});
  const answer=await answerConnectedFinanceQuery(user,"personal","both",{intent:"finance_detail",confidence:1,financeType:"income"},["2026-09-01","2026-09-30"],"Quanto recebi no mês passado no modo pessoal? Separe as receitas por categoria.");
  expect(answer).toContain("Receitas por categoria");expect(answer).toContain(bankMoney("150","BRL"));expect(answer).toContain("Rendimentos");
  expect(answer).not.toContain("Movimentações encontradas");
});
it("honors a request to separate category spending by bank",async()=>{
  m.read.mockResolvedValue({entries:[
    {id:"a",mode:"personal",included:true,source:"bank",date:"2026-10-05",type:"expense",category:"Transporte",description:"Viagem",amount:20,bank:{resource_type:"card",institution_name:"Banco A"}},
    {id:"b",mode:"personal",included:true,source:"bank",date:"2026-10-06",type:"expense",category:"Transporte",description:"Viagem",amount:30,bank:{resource_type:"card",institution_name:"Banco B"}},
  ],bank:{overview:{connections:[{}]},report:{sync_pending:false,missing_dates:0,last_successful_sync_at:"2026-10-14"}}});
  const answer=await answerConnectedFinanceQuery(user,"personal","both",{intent:"finance_query",confidence:1,category:"Transporte"},["2026-10-01","2026-10-31"],"Quanto gastei em transporte neste mês? Separe por banco.");
  expect(answer).toContain("Por banco");expect(answer).toContain("Banco A");expect(answer).toContain("Banco B");
});
