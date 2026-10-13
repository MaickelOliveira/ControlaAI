import {afterEach,beforeEach,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
const m=vi.hoisted(()=>({owner:vi.fn(),send:vi.fn(),model:vi.fn(),rpc:vi.fn(),recurring:vi.fn(),confirm:vi.fn(),due:vi.fn()}));
vi.mock("@google/generative-ai",()=>({GoogleGenerativeAI:class{getGenerativeModel(){return{generateContent:m.model}}}}));
vi.mock("./whatsapp-config",()=>({getConfig:vi.fn(async()=>({geminiApiKey:"fake-recurring-classifier-key"}))}));
vi.mock("./users",async original=>({...await original<typeof import("./users")>(),getUserById:m.owner}));
vi.mock("./wpp-phone-links",()=>({getUserIdByPhone:vi.fn().mockResolvedValue("recurring-holder"),getPhoneAccess:vi.fn().mockResolvedValue("both"),getPhonesForUser:vi.fn().mockResolvedValue([{phone:"5511999990000",name:"Fixture",relation:"Titular"}])}));
vi.mock("./pending-actions",async original=>({...await original<typeof import("./pending-actions")>(),getPendingAction:vi.fn().mockResolvedValue(null)}));
vi.mock("./conversations",async original=>({...await original<typeof import("./conversations")>(),addMessage:vi.fn(),getAiPaused:vi.fn().mockResolvedValue(false),getAiHistory:vi.fn().mockResolvedValue([])}));
vi.mock("./whatsapp",()=>({sendText:m.send,sendFile:vi.fn()}));
vi.mock("./open-finance-access",()=>({getOpenFinanceAccess:vi.fn(async()=>({userId:"recurring-holder",mode:"personal",environment:"production"})),canEnrollOpenFinance:()=>true}));
vi.mock("./open-finance-http",()=>({openFinanceRpc:m.rpc}));
vi.mock("./recurring",async original=>({...await original<typeof import("./recurring")>(),getRecurringByUser:m.recurring,findDueRecurringMatches:m.due,confirmRecurring:m.confirm}));
vi.mock("./accounts",async original=>({...await original<typeof import("./accounts")>(),getManualAccountsByUser:vi.fn().mockResolvedValue([])}));
import {handleIncomingMessage} from "./message-handler";

beforeEach(()=>{
 vi.clearAllMocks();vi.useFakeTimers({toFake:["Date"]});vi.setSystemTime(new Date("2026-10-12T15:00:00Z"));
 vi.stubEnv("MULTI_COMPANY_ENABLED","false");vi.stubEnv("OPEN_FINANCE_WHATSAPP_ENABLED","true");
 vi.stubEnv("AI_FIRST_INTENT_ENABLED","true");vi.stubEnv("OPENAI_TEST_USER_IDS","");vi.stubEnv("OPENAI_API_KEY","");
 m.owner.mockResolvedValue({id:"recurring-holder",name:"Fixture",email:"fixture@example.test",plan:"business",status:"active",activeMode:"personal",locale:"pt-BR",customCategoriesExpense:[],customCategoriesIncome:[]});
 m.send.mockResolvedValue(true);m.due.mockResolvedValue([]);
 m.model.mockResolvedValue({response:{text:()=>JSON.stringify({intent:"finance_query",confidence:.98,period:{from:"2026-10-01",to:"2026-10-31"},keyword:"parcelados"})}});
 m.recurring.mockResolvedValue([{id:"manual",description:"Parcela manual fictícia",type:"expense",amount:20,category:"Outros",recurrenceType:"installment",totalInstallments:10,paidInstallments:2,repeatUnit:"monthly",nextDueDate:"2026-11-10",status:"active",mode:"personal"}]);
 m.rpc.mockResolvedValue({incomplete:false,items:[{id:"bank",kind:"installment",resource_id:"card",description:"Parcela bancária fictícia",institution_name:"Banco fictício",resource_name:"Cartão fictício",amount:"49.90",currency:"BRL",due_date:null,synced_at:"2026-10-11",total_installments:12,observed_installments:2}]});
});
afterEach(()=>{vi.useRealTimers();vi.unstubAllEnvs()});

it("uses the real classifier normalization and handler to retain undated bank installments despite the model's erroneous spending period",async()=>{
 await handleIncomingMessage({from:"5511999990000",text:"o que tenho de parcelados"});
 const reply=m.send.mock.calls.map(call=>call[1]).join("\n");
 expect(m.model).toHaveBeenCalledOnce();
 expect(reply).toContain("Parcela manual fictícia");expect(reply).toContain("Parcela bancária fictícia");
 expect(reply).toContain("Última parcela identificada: 2 de 12");expect(reply).toContain("10 parcelas previstas");expect(reply).not.toContain("sem vencimento informado ficaram fora");
 expect(m.recurring).toHaveBeenCalledWith("recurring-holder","personal","active",true);
 expect(m.send.mock.calls.every(call=>call[2]?.privateFinancial)).toBe(true);
 expect(m.confirm).not.toHaveBeenCalled();expect(m.due).not.toHaveBeenCalled();
});

it("honors an explicitly requested month after repairing the same classifier error",async()=>{
 await handleIncomingMessage({from:"5511999990000",text:"o que tenho de parcelados em novembro"});
 const reply=m.send.mock.calls.map(call=>call[1]).join("\n");
 expect(m.model).toHaveBeenCalledOnce();expect(reply).toContain("Parcela manual fictícia");
 expect(reply).not.toContain("Parcela bancária fictícia");expect(reply).toContain("sem vencimento informado ficaram fora");
 expect(m.confirm).not.toHaveBeenCalled();expect(m.due).not.toHaveBeenCalled();
});
