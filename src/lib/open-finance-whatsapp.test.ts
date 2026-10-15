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
it("uses the requested previous month and the own connected ledger",async()=>{
  const answer=await answerConnectedFinanceQuery(user,"personal","both",{intent:"finance_query",confidence:1,period:{from:"2026-09-01",to:"2026-09-30"}},["2026-10-01","2026-10-31"]);
  expect(answer).toContain("R$ 35,00");expect(answer).toContain("01/09/2026");expect(m.read).toHaveBeenCalledWith(user,"personal","2026-09-01","2026-09-30");
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
