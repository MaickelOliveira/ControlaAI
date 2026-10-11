import {beforeEach,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
const m=vi.hoisted(()=>({access:vi.fn(),read:vi.fn(),bank:vi.fn(),pending:vi.fn(),recurring:vi.fn()}));
vi.mock("./open-finance-access",()=>({getOpenFinanceAccess:m.access,canEnrollOpenFinance:()=>true}));
vi.mock("./unified-finances",()=>({readUnifiedFinances:m.read}));
vi.mock("./open-finance-question",()=>({answerBankQuestion:m.bank,parseBankQuestion:()=>null}));
vi.mock("./finances",()=>({expandMerchantAliases:(s:string)=>[s],getPendingFinances:m.pending}));
vi.mock("./recurring",()=>({getRecurringByUser:m.recurring}));
import {answerConnectedFinanceQuery} from "./open-finance-whatsapp";
const user={id:"own-user",email:"user@example.test",plan:"business",activeMode:"personal",status:"active"} as const;
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv("OPEN_FINANCE_WHATSAPP_ENABLED","true");m.access.mockResolvedValue({userId:user.id,mode:"personal",environment:"production"});m.read.mockResolvedValue({entries:[{id:"bank:b",mode:"personal",included:true,source:"bank",date:"2026-09-10",type:"expense",category:"Outros",description:"Test",amount:35,bank:{resource_type:"account"}}],bank:{overview:{connections:[{}]},report:{sync_pending:false,missing_dates:0,last_successful_sync_at:null}}});m.pending.mockResolvedValue([]);m.recurring.mockResolvedValue([]);});
it("uses the requested previous month and the own connected ledger",async()=>{
  const answer=await answerConnectedFinanceQuery(user,"personal","both",{intent:"finance_query",confidence:1,period:{from:"2026-09-01",to:"2026-09-30"}},["2026-10-01","2026-10-31"]);
  expect(answer).toContain("R$ 35,00");expect(answer).toContain("01/09/2026");expect(m.read).toHaveBeenCalledWith(user,"personal","2026-09-01","2026-09-30");
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
