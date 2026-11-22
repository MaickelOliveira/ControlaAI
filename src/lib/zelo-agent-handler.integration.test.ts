import {afterEach,beforeEach,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
const m=vi.hoisted(()=>({owner:vi.fn(),send:vi.fn(),model:vi.fn(),plan:vi.fn(),pending:vi.fn(),add:vi.fn()}));
vi.mock("@google/generative-ai",()=>({GoogleGenerativeAI:class{getGenerativeModel(){return{generateContent:m.model}}}}));
vi.mock("./whatsapp-config",()=>({getConfig:vi.fn(async()=>({geminiApiKey:"fake-agent-key"}))}));
vi.mock("./users",async original=>({...await original<typeof import("./users")>(),getUserById:m.owner}));
vi.mock("./wpp-phone-links",()=>({getUserIdByPhone:vi.fn().mockResolvedValue("agent-holder"),getPhoneAccess:vi.fn().mockResolvedValue("both"),getPhonesForUser:vi.fn().mockResolvedValue([{phone:"5511999990000",name:"Fixture",relation:"Titular"}])}));
vi.mock("./pending-actions",async original=>({...await original<typeof import("./pending-actions")>(),getPendingAction:m.pending}));
vi.mock("./conversations",async original=>({...await original<typeof import("./conversations")>(),addMessage:m.add,getAiPaused:vi.fn().mockResolvedValue(false),getAiHistory:vi.fn().mockResolvedValue([])}));
vi.mock("./whatsapp",()=>({sendText:m.send,sendFile:vi.fn()}));
vi.mock("./accounts",async original=>({...await original<typeof import("./accounts")>(),getManualAccountsByUser:vi.fn().mockResolvedValue([])}));
vi.mock("./zelo-agent",async original=>({...await original<typeof import("./zelo-agent")>(),planWithZeloAgent:m.plan}));
import {handleIncomingMessage} from "./message-handler";

const from="5511999990000";
const replies=()=>m.send.mock.calls.map(call=>String(call[1]));
// O classificador antigo responde ecoando o comando que recebeu, para o teste
// enxergar exatamente o que o agente mandou para o fluxo existente.
const classifiedCommands=()=>m.model.mock.calls.map(call=>String(call[0]).match(/Mensagem do usuário: "([^"]*)"/)?.[1]);

beforeEach(()=>{
 vi.clearAllMocks();
 vi.stubEnv("MULTI_COMPANY_ENABLED","false");vi.stubEnv("AI_FIRST_INTENT_ENABLED","true");
 vi.stubEnv("OPENAI_TEST_USER_IDS","");vi.stubEnv("OPENAI_API_KEY","");
 vi.stubEnv("ZELO_AGENT_ENABLED","canary");vi.stubEnv("ZELO_AGENT_TEST_PHONES",from);
 m.owner.mockResolvedValue({id:"agent-holder",name:"Fixture",email:"fixture@example.test",plan:"business",status:"active",activeMode:"personal",locale:"pt-BR",customCategoriesExpense:[],customCategoriesIncome:[]});
 m.send.mockResolvedValue(true);m.pending.mockResolvedValue(null);
 m.model.mockImplementation(async(prompt:string)=>{
  const command=prompt.match(/Mensagem do usuário: "([^"]*)"/)?.[1]??"";
  return {response:{text:()=>JSON.stringify({intent:"unknown",confidence:.9,response:`executado: ${command}`})}};
 });
});
afterEach(()=>{vi.unstubAllEnvs()});

it("answers conversation naturally without touching the old classifier",async()=>{
 m.plan.mockResolvedValue({kind:"reply",reply:"Que bom que ajudou! Precisando, é só chamar."});
 await handleIncomingMessage({from,text:"valeu demais, vc salvou meu dia"});
 expect(replies()).toEqual([expect.stringContaining("Que bom que ajudou!")]);
 expect(m.model).not.toHaveBeenCalled();
});

it("splits one message into several commands and runs each through the existing flow, in order",async()=>{
 m.plan.mockResolvedValue({kind:"commands",commands:["registrar despesa de 120 reais de luz hoje","me lembrar de pagar a água na sexta"]});
 await handleIncomingMessage({from,text:"paguei 120 de luz e me lembra da agua sexta"});
 expect(m.plan).toHaveBeenCalledOnce();
 expect(classifiedCommands()).toEqual(["registrar despesa de 120 reais de luz hoje","me lembrar de pagar a água na sexta"]);
 expect(replies().join("\n")).toMatch(/executado: registrar despesa[\s\S]*executado: me lembrar/);
 // Só a mensagem original do cliente vai para o histórico.
 expect(m.add.mock.calls.filter(call=>call[1]?.role==="user").map(call=>call[1].content)).toEqual(["paguei 120 de luz e me lembra da agua sexta"]);
});

it("does not run the next command over a question the first one left open",async()=>{
 m.plan.mockResolvedValue({kind:"commands",commands:["registrar despesa de luz","me lembrar da água na sexta"]});
 m.pending.mockImplementation(async()=>m.model.mock.calls.length?{type:"action_continuation"}:null);
 await handleIncomingMessage({from,text:"paguei a luz e me lembra da agua sexta"});
 expect(classifiedCommands()).toEqual(["registrar despesa de luz"]);
 expect(replies().at(-1)).toContain("• me lembrar da água na sexta");
});

it("runs the held request by itself once the customer answers the open question",async()=>{
 let pendingOpen=false;
 m.pending.mockImplementation(async()=>pendingOpen?{type:"action_continuation"}:null);
 m.plan.mockResolvedValueOnce({kind:"commands",commands:["registrar despesa de luz","me lembrar da água na sexta"]});
 m.model.mockImplementation(async(prompt:string)=>{
  const command=prompt.match(/Mensagem do usuário: "([^"]*)"/)?.[1]??"";
  if(command==="registrar despesa de luz")pendingOpen=true;
  return {response:{text:()=>JSON.stringify({intent:"unknown",confidence:.9,response:`executado: ${command}`})}};
 });
 await handleIncomingMessage({from,text:"paguei a luz e me lembra da agua sexta"});
 expect(classifiedCommands()).toEqual(["registrar despesa de luz"]);
 expect(replies().at(-1)).toContain("eu também faço");
 // O cliente responde à pergunta; a resposta fecha a pendência e o lembrete sai sozinho.
 m.plan.mockResolvedValue(null);
 m.model.mockImplementation(async(prompt:string)=>{
  pendingOpen=false;
  const command=prompt.match(/Mensagem do usuário: "([^"]*)"/)?.[1]??"";
  return {response:{text:()=>JSON.stringify({intent:"unknown",confidence:.9,response:`executado: ${command}`})}};
 });
 await handleIncomingMessage({from,text:"150"});
 expect(classifiedCommands().slice(-1)).toEqual(["me lembrar da água na sexta"]);
});

it("drops the held request when the customer changes the subject",async()=>{
 let pendingOpen=false;
 m.pending.mockImplementation(async()=>pendingOpen?{type:"action_continuation"}:null);
 m.plan.mockResolvedValueOnce({kind:"commands",commands:["registrar despesa de luz","me lembrar da água na sexta"]});
 m.model.mockImplementation(async(prompt:string)=>{
  const command=prompt.match(/Mensagem do usuário: "([^"]*)"/)?.[1]??"";
  if(command==="registrar despesa de luz")pendingOpen=true;
  return {response:{text:()=>JSON.stringify({intent:"unknown",confidence:.9,response:`executado: ${command}`})}};
 });
 await handleIncomingMessage({from,text:"paguei a luz e me lembra da agua sexta"});
 pendingOpen=false; // a pergunta expirou ou foi respondida em outro lugar
 m.plan.mockResolvedValue(null);
 await handleIncomingMessage({from,text:"quanto gastei hoje"});
 expect(classifiedCommands()).not.toContain("me lembrar da água na sexta");
});

it("keeps the old flow untouched when the agent has no plan",async()=>{
 m.plan.mockResolvedValue(null);
 await handleIncomingMessage({from,text:"gastei 30 de uber"});
 expect(classifiedCommands()).toEqual(["gastei 30 de uber"]);
});

it("stays off for customers outside the test list",async()=>{
 await handleIncomingMessage({from:"5511988887777",text:"gastei 30 de uber"});
 expect(m.plan).not.toHaveBeenCalled();
});

it("stays off for everyone when the flag is not set",async()=>{
 vi.stubEnv("ZELO_AGENT_ENABLED","");
 await handleIncomingMessage({from,text:"gastei 30 de uber"});
 expect(m.plan).not.toHaveBeenCalled();
 expect(classifiedCommands()).toEqual(["gastei 30 de uber"]);
});
