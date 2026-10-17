import {beforeEach,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
const m=vi.hoisted(()=>({pending:vi.fn(),recurring:vi.fn(),unified:vi.fn(),access:vi.fn(),rpc:vi.fn()}));
vi.mock("./finances",()=>({getFinancesInRangeStrict:m.pending,formatCurrency:(n:number)=>String(n)}));
vi.mock("./recurring",()=>({getRecurringByUser:m.recurring}));
vi.mock("./unified-finances",()=>({readUnifiedFinances:m.unified}));
vi.mock("./open-finance-access",()=>({getOpenFinanceAccess:m.access}));
vi.mock("./open-finance-http",()=>({openFinanceRpc:m.rpc}));
import {readBankAgenda,readFinancialAgenda} from "./financial-agenda";
import {formatBankAgenda} from "./open-finance-schedules";
const user={id:"holder",email:"holder@example.test",plan:"business",activeMode:"personal",status:"active"} as const;
beforeEach(()=>{vi.resetAllMocks();m.pending.mockResolvedValue([]);m.recurring.mockResolvedValue([]);m.access.mockResolvedValue({userId:user.id,mode:"personal",environment:"production"});m.rpc.mockResolvedValue({items:[],incomplete:false});m.unified.mockResolvedValue({entries:[{id:"bank",included:true,type:"expense",amount:40,status:"posted",source:"bank"},{id:"manual",included:true,type:"income",amount:100,status:"posted",source:"web"}],bank:null});});
it("uses bank and manual movements for the result while keeping bank bill amounts out of confirmed payables",async()=>{
  m.rpc.mockResolvedValue({items:[{id:"b",kind:"bill",resource_name:"Card",institution_name:"Bank",description:"Fatura",amount:"500",currency:"BRL",due_date:"2026-10-11",synced_at:"2026-10-11T10:00:00Z"}],incomplete:false});
  const agenda=await readFinancialAgenda(user,"personal",{from:"2026-10-01",to:"2026-10-31",today:"2026-10-11"});
  expect(agenda.forecasts[0].currentBalance).toBe(60);expect(agenda.forecasts[0].projectedBalance).toBe(60);
  expect(agenda.commitments).toEqual([]);expect(agenda.bank.items).toHaveLength(1);
});
it("keeps a failed bank read distinguishable from a zero result",async()=>{
  m.unified.mockRejectedValue(Error("OF_STORAGE_ERROR"));
  await expect(readFinancialAgenda(user,"personal",{from:"2026-10-01",to:"2026-10-31",today:"2026-10-11"})).rejects.toThrow();
});
it("labels bank items by mode when a shared phone reads both platforms",async()=>{
  m.rpc.mockResolvedValue({items:[{id:"b",kind:"bill",resource_name:"Card",institution_name:"Bank",description:"Fatura",amount:"500",currency:"BRL",due_date:"2026-10-11",synced_at:"2026-10-11T10:00:00Z"}],incomplete:false});
  const agenda=await readFinancialAgenda(user,undefined,{from:"2026-10-01",to:"2026-10-31",today:"2026-10-11"});
  expect(agenda.bank.items.map(item=>item.mode)).toEqual(["personal","business"]);
  expect(formatBankAgenda(agenda.bank.items)).toContain("Pessoal");expect(formatBankAgenda(agenda.bank.items)).toContain("Empresa");
});
it("answers WhatsApp from one bank purchase when a changing installment amount split the provider pattern",async()=>{
 const first={id:"first",resource_id:"card",kind:"installment",description:"KIWIFY *AutoDark",resource_name:"Card",institution_name:"Bank",due_date:null,amount:"258.33",currency:null,synced_at:"2026-10-17",purchase_date:"2025-12-21",source_ordinals:[1,2,3,4,5,6,7,8,9,10],total_installments:12,observed_installments:10,last_observed_installment:10,last_observed_month:"2026-10-01"};
 const tail={...first,id:"tail",description:"KIWIFY *Aut",amount:"258.24",source_ordinals:[11,12],observed_installments:2,last_observed_installment:null,last_observed_month:null};
 m.rpc.mockResolvedValue({items:[first,tail],incomplete:false});
 const agenda=await readBankAgenda(user,"personal",{from:"2026-10-17",to:"2027-10-17",includeUndated:true,includeObservedInstallments:true});
 expect(agenda.items).toHaveLength(1);
 expect(agenda.items[0]).toMatchObject({observed_installments:10,total_installments:12,amount_varies:true});
});
