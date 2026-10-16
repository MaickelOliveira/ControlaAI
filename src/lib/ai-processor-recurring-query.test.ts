import {beforeEach,afterEach,expect,it,vi} from "vitest";
const generateContent=vi.hoisted(()=>vi.fn());
vi.mock("@google/generative-ai",()=>({GoogleGenerativeAI:class{getGenerativeModel(){return{generateContent}}}}));
vi.mock("./whatsapp-config",()=>({getConfig:vi.fn(async()=>({geminiApiKey:"fake-recurring-key"}))}));
import {getExplicitRecurringQueryResult,processMessage,type AiContext} from "./ai-processor";
const context:AiContext={user:{id:"recurring-fixture",activeMode:"personal",locale:"pt-BR",customCategoriesExpense:[],customCategoriesIncome:[]},history:[]};
beforeEach(()=>{vi.stubEnv("AI_FIRST_INTENT_ENABLED","true");vi.stubEnv("OPENAI_TEST_USER_IDS","");vi.stubEnv("OPENAI_API_KEY","");generateContent.mockReset()});afterEach(()=>vi.unstubAllEnvs());
it.each(["o que tenho de parcelados","quanto tenho de parcelados","quais contas recorrentes eu tenho","me mostra minhas assinaturas"])("recognizes the customer's wording as a schedule lookup: %s",message=>{
 expect(getExplicitRecurringQueryResult(message)).toMatchObject({intent:"recurring_query"});
});
it("repairs a generic expense reply without inheriting its default spending period",async()=>{
 const period={from:"2026-10-01",to:"2026-10-31"};
 generateContent.mockResolvedValue({response:{text:()=>JSON.stringify({intent:"finance_query",confidence:.98,mode:"business",period,keyword:"parcelados"})}});
 const result=await processMessage("o que tenho de parcelados da empresa",context);
 expect(result).toMatchObject({intent:"recurring_query",mode:"business"});expect(result.period).toBeUndefined();expect(result.keyword).toBeUndefined();
});
it("keeps a recurring-only monthly request out of the broad upcoming-finances answer",async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date("2026-10-15T12:00:00Z"));
 try{
  generateContent.mockResolvedValue({response:{text:()=>JSON.stringify({intent:"finance_upcoming",confidence:.98,financeType:"expense",period:{from:"2026-10-01",to:"2026-10-31"}})}});
  const result=await processMessage("Quais cobranças recorrentes estão previstas neste mês?",context);
  expect(result).toMatchObject({intent:"recurring_query",period:{from:"2026-10-01",to:"2026-10-31"}});
  expect(result.keyword).toBeUndefined();
 }finally{vi.useRealTimers()}
});
it("preserves a broad upcoming-bills request that also mentions recurring charges",async()=>{
 generateContent.mockResolvedValue({response:{text:()=>JSON.stringify({intent:"finance_upcoming",confidence:.98,financeType:"expense"})}});
 const result=await processMessage("Quais contas a pagar neste mês, inclusive cobranças recorrentes?",context);
 expect(result.intent).toBe("finance_upcoming");
});
it("retains the explicitly requested future month when correcting the classifier",async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date("2026-10-12T12:00:00Z"));
 try{
  generateContent.mockResolvedValue({response:{text:()=>JSON.stringify({intent:"finance_query",confidence:.98,mode:"business",period:{from:"2026-10-01",to:"2026-10-31"}})}});
  expect(await processMessage("o que tenho de parcelados em novembro",context)).toMatchObject({intent:"recurring_query",period:{from:"2026-11-01",to:"2026-11-30"}});
 }finally{vi.useRealTimers()}
});
it("retains a validated bank-specific recurring query",async()=>{
 generateContent.mockResolvedValue({response:{text:()=>JSON.stringify({intent:"bank_query",confidence:.98,bankQuery:{kind:"recurring",bankName:"Banco fictício"}})}});
 expect(await processMessage("quais contas recorrentes tenho no Banco fictício",context)).toMatchObject({intent:"bank_query",bankQuery:{kind:"recurring",bankName:"Banco fictício"}});
});
it.each([
  {intent:"bank_query",confidence:.98},
  {intent:"bank_query",confidence:.98,bankQuery:{kind:"recurring"}},
])("routes bank subscriptions not manually registered to a comparable recurring lookup: %j",async modeled=>{
 generateContent.mockResolvedValue({response:{text:()=>JSON.stringify(modeled)}});
 expect(await processMessage("Quais assinaturas foram detectadas pelo banco e não cadastradas por mim?",context)).toMatchObject({intent:"recurring_query"});
});
it("routes uncertain recurring values to a focused lookup even when AI chooses a generic bank query",async()=>{
 generateContent.mockResolvedValue({response:{text:()=>JSON.stringify({intent:"bank_query",confidence:.98,bankQuery:{kind:"recurring"}})}});
 expect(await processMessage("Quais cobranças recorrentes não têm valor confiável?",context)).toMatchObject({intent:"recurring_query"});
});
it("routes the requested remaining installment total away from a generic bank list",async()=>{
 generateContent.mockResolvedValue({response:{text:()=>JSON.stringify({intent:"bank_query",confidence:.98,bankQuery:{kind:"installments"}})}});
 expect(await processMessage("Quanto ainda falta nas parcelas com total conhecido?",context)).toMatchObject({intent:"recurring_query"});
});
it.each(["registra 50 reais em compra parcelada","cancela minhas assinaturas","quanto gastei com assinaturas"])("does not turn a mutation or past spending into a schedule lookup: %s",message=>{
 expect(getExplicitRecurringQueryResult(message)).toBeNull();
});
