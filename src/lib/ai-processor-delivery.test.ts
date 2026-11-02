import {afterEach,beforeEach,expect,it,vi} from "vitest";
const generateContent=vi.hoisted(()=>vi.fn());
vi.mock("@google/generative-ai",()=>({GoogleGenerativeAI:class {getGenerativeModel(){return {generateContent};}}}));
vi.mock("./whatsapp-config",()=>({getConfig:vi.fn(async()=>({geminiApiKey:"fictional-delivery-classifier"}))}));
import {processMessage,type AIResult,type AiContext} from "./ai-processor";
const period={from:"2026-09-01",to:"2026-09-30"};
const context:AiContext={phone:"5511999000000",user:{id:"fictional-delivery-user",activeMode:"personal",locale:"pt-BR",customCategoriesExpense:[],customCategoriesIncome:[]},history:[]};
beforeEach(()=>{vi.useFakeTimers({toFake:["Date"]});vi.setSystemTime(new Date("2026-10-15T12:00:00-03:00"));vi.stubEnv("AI_FIRST_INTENT_ENABLED","true");vi.stubEnv("OPENAI_TEST_USER_IDS","");vi.stubEnv("OPENAI_API_KEY","");generateContent.mockReset();});
afterEach(()=>{vi.unstubAllEnvs();vi.useRealTimers();});
function model(result:Partial<AIResult>){generateContent.mockResolvedValueOnce({response:{text:()=>JSON.stringify({confidence:.95,period,...result})}});}
it.each(["quanto gastei com delivery mês passado?","quanto gastei na categoria Delivery?"])("reads the whole category when the classifier omits its filter: %s",async message=>{
  model({intent:"finance_query",category:"Alimentação",keyword:"delivery"});
  const result=await processMessage(message,context);
  expect(generateContent).toHaveBeenCalledOnce();
  expect(result).toMatchObject({intent:"finance_query",category:"Delivery",financeType:"expense",period});
  expect(result.keyword).toBeUndefined();
});
it("corrects a category spending question misclassified as general help",async()=>{
  model({intent:"how_to",response:"Delivery é comida entregue"});
  expect(await processMessage("quanto gastei com delivery?",context)).toMatchObject({intent:"finance_query",category:"Delivery",financeType:"expense",period});
});
it("keeps bank/source filters on a banking spending query while correcting the category",async()=>{
  model({intent:"bank_query",bankQuery:{kind:"spending",bankName:"Nubank",source:"card",category:"Alimentação",keyword:"delivery"}});
  const result=await processMessage("quanto gastei com delivery no cartão Nubank?",context);
  expect(result).toMatchObject({intent:"bank_query",bankQuery:{kind:"spending",bankName:"Nubank",source:"card",category:"Delivery"},period});
  expect(result.bankQuery?.keyword).toBeUndefined();
});
it("keeps a resolved bank qualifier even without the word card",async()=>{
  model({intent:"bank_query",bankQuery:{kind:"spending",bankName:"Nubank",category:"Alimentação"}});
  expect(await processMessage("quanto gastei com delivery no Nubank?",context)).toMatchObject({intent:"bank_query",bankQuery:{kind:"spending",bankName:"Nubank",category:"Delivery"},period});
});
it.each(["quanto gastei na categoria Delivery no Pizza Hut mês passado?","quanto gastei com delivery no Pizza Hut mês passado?"])("keeps an additional merchant not in the app dictionary: %s",async message=>{
  model({intent:"finance_query",category:"Alimentação",keyword:"Pizza Hut"});
  expect(await processMessage(message,context)).toMatchObject({intent:"finance_query",category:"Delivery",keyword:"Pizza Hut",period});
});
it("preserves both category and an unknown merchant within the specified bank and card",async()=>{
  model({intent:"bank_query",bankQuery:{kind:"spending",bankName:"Nubank",source:"card",category:"Alimentação",keyword:"Pizza Hut"}});
  expect(await processMessage("quanto gastei na categoria Delivery no Pizza Hut no cartão Nubank?",context)).toMatchObject({intent:"bank_query",bankQuery:{kind:"spending",bankName:"Nubank",source:"card",category:"Delivery",keyword:"Pizza Hut"},period});
});
it("keeps a named app as a merchant on bank spending queries even when the model omits its keyword",async()=>{
  model({intent:"bank_query",bankQuery:{kind:"spending",bankName:"Nubank",source:"card",category:"Delivery"}});
  expect(await processMessage("quanto gastei com Keeta no cartão Nubank?",context)).toMatchObject({intent:"bank_query",bankQuery:{kind:"spending",bankName:"Nubank",source:"card",keyword:"keeta"},period});
});
it.each(["how_to","finance_query","bank_query"] as const)("asks for the missing merchant instead of broadening a qualified question after %s misclassification",async intent=>{
  model({intent,...(intent==="bank_query"?{bankQuery:{kind:"spending",bankName:"Nubank",source:"card"} as const}:{}),response:"Texto genérico fictício"});
  const result=await processMessage("quanto gastei na categoria Delivery no Pizza Hut?",context);
  expect(result.intent).toBe("unknown");
  expect(result.response).toMatch(/estabelecimento/i);
});
it.each(["iFood","Zé Delivery","Delivery Much","Quero Delivery","Keeta"])("keeps a named merchant %s as a merchant query",async merchant=>{
  model({intent:"finance_query",category:"Delivery"});
  const result=await processMessage(`quanto gastei com ${merchant}?`,context);
  expect(result.intent).toBe("finance_query");expect(result.keyword).toBeTruthy();expect(result.category).toBeUndefined();
});
it.each(["o que é a categoria Delivery?","como altero a categoria para Delivery?"])("does not turn help into a financial read: %s",async message=>{
  model({intent:"how_to",response:"Ajuda fictícia"});
  expect(await processMessage(message,context)).toMatchObject({intent:"how_to",response:"Ajuda fictícia"});
});
it.each([
 ["quanto gastei de delivery mes de outubro","2026-10-01","2026-10-31"],
 ["quanto gastei de delivery mes de setembro","2026-09-01","2026-09-30"],
 ["quanto gastei de delivery em outubo","2026-10-01","2026-10-31"],
 ["quanto gastei com delivery em dezembro","2025-12-01","2025-12-31"],
 ["quanto gastei com delivery em fevereiro de 2024","2024-02-01","2024-02-29"],
])("uses the named historical month and never invents Zé Delivery: %s",async(message,from,to)=>{
 vi.setSystemTime(new Date("2026-11-02T12:00:00-03:00"));
 model({intent:"finance_query",period:{from:"2026-11-01",to:"2026-11-30"},category:"Outros",keyword:"Zé Delivery"});
 const result=await processMessage(message,context);
 expect(result).toMatchObject({intent:"finance_query",category:"Delivery",financeType:"expense",period:{from,to}});
 expect(result.keyword).toBeUndefined();
});
it("overrides an incorrect prior-month answer while preserving an explicitly named merchant",async()=>{
 vi.setSystemTime(new Date("2026-11-02T12:00:00-03:00"));
 model({intent:"finance_query",period,category:"Delivery"});
 const result=await processMessage("quanto gastei com Zé Delivery em outubro",context);
 expect(result).toMatchObject({intent:"finance_query",keyword:"ze delivery",period:{from:"2026-10-01",to:"2026-10-31"}});
 expect(result.category).toBeUndefined();
});
it("uses October after a September conversation instead of inheriting its period",async()=>{
 vi.setSystemTime(new Date("2026-11-02T12:00:00-03:00"));
 model({intent:"finance_query",period,category:"Delivery"});
 const result=await processMessage("e em outubro?",{...context,history:[{role:"user",content:"quanto gastei com delivery em setembro?"},{role:"assistant",content:"Período 01/09/2026 a 30/09/2026"}]});
 expect(result).toMatchObject({intent:"finance_query",period:{from:"2026-10-01",to:"2026-10-31"}});
});

it.each([
 ["quanto gastei no mês de outubro do ano passado","2025-10-01","2025-10-31"],
 ["quanto gastei com delivery em outubro do ano passado","2025-10-01","2025-10-31"],
 ["cuánto gasté en octubre del año pasado","2025-10-01","2025-10-31"],
 ["descreva meus gastos por categoria em fevereiro do ano passado","2025-02-01","2025-02-28"],
 ["quanto gastei em dezembro deste ano","2026-12-01","2026-12-31"],
 ["quanto gastei em outubro de 2024","2024-10-01","2024-10-31"],
])("honors a named month and its relative or explicit year: %s",async(message,from,to)=>{
 vi.setSystemTime(new Date("2026-11-02T12:00:00-03:00"));
 model({intent:"finance_query",period:{from:"2026-11-01",to:"2026-11-30"}});
 expect(await processMessage(message,context)).toMatchObject({period:{from,to}});
});
