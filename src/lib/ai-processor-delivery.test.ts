import {afterEach,beforeEach,expect,it,vi} from "vitest";
const generateContent=vi.hoisted(()=>vi.fn());
vi.mock("@google/generative-ai",()=>({GoogleGenerativeAI:class {getGenerativeModel(){return {generateContent};}}}));
vi.mock("./whatsapp-config",()=>({getConfig:vi.fn(async()=>({geminiApiKey:"fictional-delivery-classifier"}))}));
import {processMessage,type AIResult,type AiContext} from "./ai-processor";
const period={from:"2026-09-01",to:"2026-09-30"};
const context:AiContext={phone:"5511999000000",user:{id:"fictional-delivery-user",activeMode:"personal",locale:"pt-BR",customCategoriesExpense:[],customCategoriesIncome:[]},history:[]};
beforeEach(()=>{vi.stubEnv("AI_FIRST_INTENT_ENABLED","true");vi.stubEnv("OPENAI_TEST_USER_IDS","");vi.stubEnv("OPENAI_API_KEY","");generateContent.mockReset();});
afterEach(()=>vi.unstubAllEnvs());
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
