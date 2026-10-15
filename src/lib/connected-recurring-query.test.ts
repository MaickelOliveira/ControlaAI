import {beforeEach,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
const m=vi.hoisted(()=>({access:vi.fn(),agenda:vi.fn()}));
vi.mock("./open-finance-access",()=>({getOpenFinanceAccess:m.access}));
vi.mock("./financial-agenda",()=>({readBankAgenda:m.agenda}));
import {connectedRecurringAppendix} from "./connected-recurring-query";

const user={id:"owner",email:"owner@example.test",activeMode:"personal" as const,plan:"business" as const,status:"active" as const};
const item=(id:string,description:string)=>({id,kind:"recurring" as const,description,institution_name:"Nubank",resource_name:"Platinum",due_date:"2026-11-11",amount:"20.90",currency:"BRL",synced_at:"2026-10-15"});
const question="Quais assinaturas foram detectadas pelo banco e não cadastradas por mim?";
beforeEach(()=>{
 vi.resetAllMocks();vi.stubEnv("OPEN_FINANCE_WHATSAPP_ENABLED","true");
 m.access.mockResolvedValue({userId:"owner",mode:"personal",environment:"production"});
 m.agenda.mockResolvedValue({incomplete:false,items:[item("n","Netflix"),item("g","Google One"),item("z","Zé Delivery")]});
});

it("compares bank subscriptions with manually registered ones and excludes repeated delivery orders",async()=>{
 const result=await connectedRecurringAppendix(user,"personal",{intent:"recurring_query",confidence:1},question,"2026-10-15",[
  {description:"Netflix",type:"expense",recurrenceType:"recurring"},
 ]);
 expect(result).toContain("Google One");
 expect(result).not.toContain("Netflix");
 expect(result).not.toContain("Zé Delivery");
 expect(result).toContain("cadastro manual semelhante");
});
it("does not claim that every subscription was registered when the bank list has no unmatched item",async()=>{
 m.agenda.mockResolvedValue({incomplete:true,items:[item("n","Netflix"),item("z","Zé Delivery")]});
 const result=await connectedRecurringAppendix(user,"personal",{intent:"recurring_query",confidence:1},question,"2026-10-15",[
  {description:"Netflix",type:"expense",recurrenceType:"recurring"},
 ]);
 expect(result).toContain("Não encontrei assinatura bancária sem cadastro manual semelhante");
 expect(result).toContain("não confirma que todas foram cadastradas");
 expect(result).toContain("consulta bancária está incompleta");
 expect(result).not.toContain("Zé Delivery");
});
