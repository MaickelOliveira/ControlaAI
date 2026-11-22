import {afterEach, beforeEach, expect, it, vi} from "vitest";
vi.mock("server-only",()=>({}));
const m=vi.hoisted(()=>({owner:vi.fn(),send:vi.fn(),process:vi.fn(),recurring:vi.fn(),confirm:vi.fn(),due:vi.fn(),imported:vi.fn(),history:vi.fn(),records:vi.fn()}));
vi.mock("./users",async original=>({...await original<typeof import("./users")>(),getUserById:m.owner}));
vi.mock("./wpp-phone-links",()=>({getUserIdByPhone:vi.fn().mockResolvedValue("forecast-holder"),getPhoneAccess:vi.fn().mockResolvedValue("both"),getPhonesForUser:vi.fn().mockResolvedValue([{phone:"5511999990000",name:"Fixture",relation:"Titular"}])}));
vi.mock("./pending-actions",async original=>({...await original<typeof import("./pending-actions")>(),getPendingAction:vi.fn().mockResolvedValue(null)}));
vi.mock("./conversations",async original=>({...await original<typeof import("./conversations")>(),addMessage:vi.fn(),getAiPaused:vi.fn().mockResolvedValue(false),getAiHistory:m.history}));
vi.mock("./whatsapp",()=>({sendText:m.send,sendFile:vi.fn()}));
vi.mock("./ai-processor",async original=>({...await original<typeof import("./ai-processor")>(),processMessage:m.process}));
vi.mock("./open-finance-access",()=>({getOpenFinanceAccess:vi.fn().mockResolvedValue(null),canEnrollOpenFinance:()=>false}));
vi.mock("./open-finance-http",()=>({openFinanceRpc:vi.fn().mockRejectedValue(Error("No bank transport expected in this fixture"))}));
vi.mock("./recurring",async original=>({...await original<typeof import("./recurring")>(),getRecurringByUser:m.recurring,findDueRecurringMatches:m.due,confirmRecurring:m.confirm}));
vi.mock("./accounts",async original=>({...await original<typeof import("./accounts")>(),getManualAccountsByUser:vi.fn().mockResolvedValue([])}));
vi.mock("./finances",async original=>({...await original<typeof import("./finances")>(),getImportedInstallmentStatuses:m.imported,getFinancesInRangeStrict:m.records}));
import {handleIncomingMessage} from "./message-handler";
import {getExplicitRecurringQueryResult} from "./ai-processor";

beforeEach(()=>{
 vi.clearAllMocks();vi.useFakeTimers({toFake:["Date"]});vi.setSystemTime(new Date("2026-10-12T15:00:00Z"));
 vi.stubEnv("MULTI_COMPANY_ENABLED","false");vi.stubEnv("OPEN_FINANCE_WHATSAPP_ENABLED","false");
 m.owner.mockResolvedValue({id:"forecast-holder",name:"Fixture",email:"fixture@example.test",plan:"business",status:"active",activeMode:"personal",locale:"pt-BR"});
 m.history.mockResolvedValue([]);m.records.mockResolvedValue([]);
 m.send.mockResolvedValue(true);m.imported.mockResolvedValue([]);m.due.mockResolvedValue([]);
 m.recurring.mockResolvedValue([{id:"fixture-installment",userId:"forecast-holder",description:"Notebook fictício",type:"expense",amount:20,category:"Outros",recurrenceType:"installment",totalInstallments:10,paidInstallments:8,repeatUnit:"monthly",nextDueDate:"2026-10-10",status:"active",mode:"personal"}]);
});
afterEach(()=>{vi.useRealTimers();vi.unstubAllEnvs()});

it.each(["explicit until-month range","classifier target-month range"])("forecasts November completion even when the next unpaid October installment precedes period.from: %s",async source=>{
 const message="quais parcelas terminam até dezembro?";
 const result=getExplicitRecurringQueryResult(message)!;
 expect(result.installmentForecast).toBe(true);
 expect(result.period?.to).toBe("2026-12-31");
 m.process.mockResolvedValue(source==="classifier target-month range"?{...result,period:{from:"2026-12-01",to:"2026-12-31"}}:result);
 await handleIncomingMessage({from:"5511999990000",text:message});
 const reply=m.send.mock.calls.map(call=>call[1]).join("\n");
 expect(reply).toContain("Notebook fictício");
 expect(reply).toContain("11/2026");
 expect(reply).not.toContain("Não encontrei parcelas cadastradas");
 expect(m.confirm).not.toHaveBeenCalled();expect(m.due).not.toHaveBeenCalled();
});

it.each(["Quanto sobrará no mês de dezembro?", "Qual o saldo financeiro projetado para 31/12/2026?", "Por favor"])("answers the requested December projection through the WhatsApp entry point: %s",async text=>{
 m.recurring.mockResolvedValue([{id:"salary",userId:"forecast-holder",type:"income",amount:2500,description:"Salário",status:"active",mode:"personal",nextDueDate:"2026-12-10",repeatUnit:"monthly"},
 {id:"rent",userId:"forecast-holder",type:"expense",amount:900,description:"Aluguel",status:"active",mode:"personal",nextDueDate:"2026-12-10",repeatUnit:"monthly"}]);
 m.records.mockResolvedValue([{id:"opening",type:"income",status:"posted",date:"2026-09-15",amount:100,mode:"personal"}]);
 m.history.mockResolvedValue([{role:"assistant",content:"Posso fazer a projeção financeira para dezembro de 2026?",ts:1},{role:"user",content:text,ts:2}]);
 await handleIncomingMessage({from:"5511999990000",text});
 const reply=m.send.mock.calls.map(call=>call[1]).join("\n").replace(/\u00a0/g," ");
 expect(reply).toContain("01/12/2026 a 31/12/2026");expect(reply).toContain("1.700,00");
 expect(m.process).not.toHaveBeenCalled();expect(m.confirm).not.toHaveBeenCalled();
});
it("keeps a storage failure out of client totals",async()=>{
 m.recurring.mockRejectedValueOnce(Error("fixture unavailable"));
 await handleIncomingMessage({from:"5511999990000",text:"Qual meu saldo projetado para dezembro?"});
 const reply=m.send.mock.calls.map(call=>call[1]).join("\n");
 expect(reply).toContain("Não consegui conferir");expect(reply).not.toContain("0,00");
});
