import {beforeEach,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
const m=vi.hoisted(()=>({access:vi.fn(),read:vi.fn(),bank:vi.fn(),pending:vi.fn(),recurring:vi.fn(),agenda:vi.fn()}));
vi.mock("./financial-agenda",()=>({readBankAgenda:m.agenda}));
vi.mock("./open-finance-access",()=>({getOpenFinanceAccess:m.access,canEnrollOpenFinance:()=>true}));
vi.mock("./unified-finances",()=>({readUnifiedFinances:m.read}));
vi.mock("./open-finance-question",()=>({answerBankQuestion:m.bank,parseBankQuestion:()=>null}));
vi.mock("./finances",()=>({expandMerchantAliases:(s:string)=>[s],getPendingFinances:m.pending}));
vi.mock("./recurring",()=>({getRecurringByUser:m.recurring}));
import {answerBankWhatsAppMessage,answerConnectedFinanceQuery} from "./open-finance-whatsapp";
import {bankMoney} from "./open-finance-display";
const user={id:"own-user",email:"user@example.test",plan:"business",activeMode:"personal",status:"active"} as const;
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv("OPEN_FINANCE_WHATSAPP_ENABLED","true");m.access.mockResolvedValue({userId:user.id,mode:"personal",environment:"production"});m.read.mockResolvedValue({entries:[{id:"bank:b",mode:"personal",included:true,source:"bank",date:"2026-09-10",type:"expense",category:"Outros",description:"Test",amount:35,bank:{resource_type:"account"}}],bank:{overview:{connections:[{}]},report:{sync_pending:false,missing_dates:0,last_successful_sync_at:null}}});m.pending.mockResolvedValue([]);m.recurring.mockResolvedValue([]);m.agenda.mockResolvedValue({items:[],incomplete:false});});
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
