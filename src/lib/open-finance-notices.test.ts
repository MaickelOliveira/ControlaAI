import {beforeEach,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
const m=vi.hoisted(()=>({rpc:vi.fn(),scope:vi.fn(),user:vi.fn(),phone:vi.fn(),send:vi.fn()}));
vi.mock("./supabase",()=>({getSupabase:()=>({rpc:m.rpc})}));
vi.mock("./open-finance-http",()=>({openFinanceRpc:async (_scope:unknown,name:string,args:unknown)=>(await m.rpc(name,args)).data}));
vi.mock("./open-finance-access",()=>({isPublicOpenFinanceEnabled:()=>true,getOpenFinanceAccess:m.scope}));
vi.mock("./users",()=>({getUserById:m.user,hasAccess:(u:{status:string})=>u.status==="active"}));
vi.mock("./wpp-phone-links",()=>({getPhoneAccess:m.phone}));
vi.mock("./whatsapp",()=>({sendReminderTemplate:m.send,buildReminderTemplateDispatch:({message}:{message:string})=>({templateName:"lbt_pessoal",params:{texto:message}})}));
import {runBankDueNotices} from "./open-finance-notices";
const uid="00000000-0000-4000-8000-000000000001",bid="00000000-0000-4000-8000-000000000002",phone="5511111111111";
beforeEach(()=>{
  vi.resetAllMocks();vi.stubEnv("OPEN_FINANCE_WHATSAPP_ENABLED","true");
  m.user.mockResolvedValue({id:uid,status:"active",locale:"pt-BR"});m.scope.mockResolvedValue({userId:uid,mode:"personal",environment:"production"});m.phone.mockResolvedValue("personal");m.send.mockResolvedValue(true);
  const today=new Date().toLocaleDateString("en-CA",{timeZone:"America/Sao_Paulo"});
  m.rpc.mockImplementation(async(name:string)=>({error:null,data:name==="zelo_of_notice_targets"?[{userId:uid,mode:"personal",phone,itemKey:`bill:${bid}`}]:name==="zelo_of_notice_claim"?bid:name==="zelo_of_agenda"?{items:[{id:bid,kind:"bill",description:"Fatura",resource_name:"Card",institution_name:"Bank",amount:"100",currency:"BRL",due_date:today,synced_at:new Date().toISOString()}],incomplete:false}:null}));
});
it("sends a bank due-date notice privately without registering an expense or asking to create one",async()=>{
  expect(await runBankDueNotices()).toBe(1);
  expect(m.send.mock.lastCall?.[2]).toContain("pagamento não confirmado");expect(m.send.mock.lastCall?.[5]).toEqual({privateFinancial:true});
  expect(m.rpc.mock.calls.find(c=>c[0]==="zelo_of_notice_finish")?.[1]).toMatchObject({p_status:"sent"});
});
it("denies a currently restricted or unlinked phone",async()=>{
  m.phone.mockResolvedValue("business");expect(await runBankDueNotices()).toBe(0);expect(m.send).not.toHaveBeenCalled();
});
it("rechecks the phone after claiming and suppresses a notice if its binding changes",async()=>{
  m.phone.mockResolvedValueOnce("personal").mockResolvedValue(null);
  expect(await runBankDueNotices()).toBe(0);expect(m.send).not.toHaveBeenCalled();
});
it("records an uncertain provider outcome instead of silently treating it as delivered",async()=>{
  m.send.mockResolvedValue(false);expect(await runBankDueNotices()).toBe(0);
  expect(m.rpc.mock.calls.find(c=>c[0]==="zelo_of_notice_finish")?.[1]).toMatchObject({p_status:"uncertain"});
});
