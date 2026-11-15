import {afterEach,beforeEach,expect,it,vi} from "vitest";
import type {ChatMessage} from "./conversations";
const state=vi.hoisted(()=>({
 scope:undefined as undefined|{userId:string;companyId:string;mode:"personal"|"business"},
 messages:[] as ChatMessage[],
 revision: null as string | null,
 beforeUpdate: null as (() => void) | null,
}));
vi.mock("./company-context",()=>({currentCompanyContext:()=>state.scope}));
vi.mock("./supabase",()=>({resolveCompanyDatabaseScope:vi.fn(),getSupabase:()=>({from:()=>({
 select:()=>({in:async()=>({data:[{phone:"5511987654321",data:{messages:structuredClone(state.messages),lastActivity:Date.now(),revision:state.revision}}]})}),
 update:(row:{data:{messages:ChatMessage[];revision:string}})=>({eq:()=>{
  const compare = (_column: string, revision: string | null) => ({select:async()=>{
   state.beforeUpdate?.();
   state.beforeUpdate = null;
   if (state.revision !== revision) return {data:[],error:null};
   state.messages = structuredClone(row.data.messages);
   state.revision = row.data.revision;
   return {data:[{phone:"5511987654321"}],error:null};
  }});
  return {eq:compare,is:compare};
 }}),
})})}));
import {addMessage,deleteInboxMessage,getAiHistory,getHistory,inboxMessageId} from "./conversations";
beforeEach(()=>{state.messages=[];state.scope=undefined;state.revision=null;state.beforeUpdate=null;vi.stubEnv("MULTI_COMPANY_ENABLED","true");});
afterEach(()=>vi.unstubAllEnvs());
const phone="5511987654321";
it("keeps A → B → A context separate while preserving the full inbox",async()=>{
 await addMessage(phone,{role:"user",content:"Mensagem antiga sem empresa",ts:1});
 state.scope={userId:"owner",companyId:"a",mode:"business"};
 await addMessage(phone,{role:"user",content:"gastei 50 na farmácia",ts:2});
 state.scope={userId:"owner",companyId:"b",mode:"business"};
 await addMessage(phone,{role:"user",content:"gastei 50 na farmácia",ts:3});
 await addMessage(phone,{role:"assistant",content:"Compra registrada em B",ts:4});
 expect((await getAiHistory(phone)).map(msg=>msg.content)).toEqual(["gastei 50 na farmácia","Compra registrada em B"]);
 state.scope={userId:"owner",companyId:"a",mode:"business"};
 expect((await getAiHistory(phone)).map(msg=>msg.content)).toEqual(["gastei 50 na farmácia"]);
 expect(await getHistory(phone)).toHaveLength(4);
});
it("does not reuse personal messages in business, or vice versa",async()=>{
 state.scope={userId:"owner",companyId:"a",mode:"personal"};
 await addMessage(phone,{role:"user",content:"Consulta particular",ts:1});
 state.scope={userId:"owner",companyId:"a",mode:"business"};
 await addMessage(phone,{role:"user",content:"Contrato empresarial",ts:2});
 expect((await getAiHistory(phone)).map(msg=>msg.content)).toEqual(["Contrato empresarial"]);
 state.scope={userId:"owner",companyId:"b",mode:"personal"};
 expect((await getAiHistory(phone)).map(msg=>msg.content)).toEqual(["Consulta particular"]);
 state.scope=undefined;await expect(getAiHistory(phone)).rejects.toThrow("COMPANY_CONTEXT_MISSING");
 vi.stubEnv("MULTI_COMPANY_ENABLED","false");expect(await getAiHistory(phone)).toHaveLength(2);
});
it("does not reuse the old holder's personal context after a phone is relinked",async()=>{
 state.scope={userId:"old-owner",companyId:"a",mode:"personal"};
 await addMessage(phone,{role:"user",content:"gastei 50 na farmácia",ts:1});
 state.scope={userId:"new-owner",companyId:"b",mode:"personal"};
 expect(await getAiHistory(phone)).toEqual([]);
 await addMessage(phone,{role:"user",content:"gastei 50 na farmácia",ts:2});
 expect(await getAiHistory(phone)).toHaveLength(1);expect(await getHistory(phone)).toHaveLength(2);
});
it("removes exactly the selected outbound message and retains a concurrent inbound message", async () => {
 const first = {role:"assistant",content:"Primeira versão",ts:1} as const;
 const other = {role:"assistant",content:"Segunda versão",ts:1} as const;
 const inbound = {role:"user",content:"Retorno do cliente",ts:2} as const;
 state.messages = [first, other];
 state.beforeUpdate = () => {
  state.revision = "newer";
  state.messages.push(inbound);
 };
 expect(await deleteInboxMessage(phone, inboxMessageId(first))).toBe(true);
 expect(await deleteInboxMessage(phone, inboxMessageId(first))).toBe(false);
 expect(await deleteInboxMessage(phone, inboxMessageId(inbound))).toBe(false);
 expect(await getHistory(phone)).toEqual([other, inbound]);
});
