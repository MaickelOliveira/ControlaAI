import {describe,expect,it} from "vitest";
import {projectBankInstallments,linkScheduledBankInstallments,type BankInstallmentAnchor,type ScheduledBankInstallment} from "./bank-installment-projections";
import {financeExpensePlan} from "./finance-expense-plan";
import {unrepresentedBankSchedules} from "./finance-bank-schedules";
import type {BankAgendaItem} from "./open-finance-schedules";
const month=(value:string)=>({from:`${value}-01`,to:`${value}-${new Date(Date.UTC(Number(value.slice(0,4)),Number(value.slice(5)),0)).getUTCDate()}`,today:"2026-08-04"});
const purchase=(id:string,position:number,total:number,bill:string,amount:string,schedule="series-new"):ScheduledBankInstallment=>({id,resource_id:"fixture-card",resource_name:"Fixture card",institution_name:"Fixture bank",resource_type:"card",date:"2026-07-25",description:`Loja Exemplo ${position}/${total}`,amount,currency:"BRL",direction:"debit",classification:"purchase",kind:"card_purchases",bill_month:`${bill}-01`,installment_number:position,installment_count:total,schedule_ids:schedule?[schedule]:[],synced_at:"2026-08-04T12:00:00Z"});
const plan=(items:ReturnType<typeof projectBankInstallments>,range:ReturnType<typeof month>)=>financeExpensePlan({posted:[],pending:[],recurring:[],loans:[],installments:items,schedules:[],...range});
const two=[purchase("two-1",1,2,"2026-09","120.50"),purchase("two-2",2,2,"2026-10","120.50")];
const three=[purchase("three-1",1,3,"2026-09","230.34","series-third"),purchase("three-2",2,3,"2026-10","230.33",""),purchase("three-3",3,3,"2026-11","230.33","")].map(row=>({...row,date:"2026-07-26",description:row.description.replace("Loja Exemplo","Outra Loja Exemplo")}));
describe("monthly budget with bank-provided future card bills",()=>{
 it("counts every known purchase in its bill month, keeps exact rounding, and stops at the last installment",()=>{
  const expected={"2026-08":0,"2026-09":350.84,"2026-10":350.83,"2026-11":230.33,"2026-12":0};
  for(const [value,total] of Object.entries(expected)){
   const range=month(value),items=projectBankInstallments([],[],range,[...two,...three]);
   expect(plan(items,range).total,value).toBe(total);
   expect(new Set(items.map(row=>`${row.id}:${row.month}`)).size).toBe(items.length);
  }
 });
 it("uses the known month and ordinal even when the first bill is several months away",()=>{
  const rows=[purchase("later",1,3,"2027-02","80.10")];
  expect(projectBankInstallments([],[],month("2027-03"),rows)).toMatchObject([{month:"2027-03",position:2,total:3,amount:"80.10",observed:false}]);
  expect(projectBankInstallments([],[],month("2027-05"),rows)).toEqual([]);
 });
 it("replaces a linked old estimate with the exact bank amount, once",()=>{
  const old:BankInstallmentAnchor={id:"series-third",resource_id:"fixture-card",description:"Outra Loja Exemplo",resource_name:"Fixture",institution_name:"Fixture bank",amount:"230.34",currency:"BRL",bill_month:"2026-08-01",observed_installments:1,total_installments:4,synced_at:"2026-08-04"};
  const rows=three.map(row=>({...row,installment_number:row.installment_number!+1,installment_count:4}));
  const items=projectBankInstallments([old],[],month("2026-10"),rows);
  expect(items).toHaveLength(1);expect(items[0]).toMatchObject({amount:"230.33",position:3,total:4});
 });
 it("does not duplicate a bank movement already present in the selected realized ledger",()=>{
  expect(projectBankInstallments([],two,month("2026-09"),two)).toEqual([]);
  expect(projectBankInstallments([],[],month("2026-09"),[...two,...two])).toHaveLength(1);
 });
 it("keeps separate purchases at one merchant and preserves ambiguous individual bank facts",()=>{
  const other=two.map(row=>({...row,id:`other-${row.id}`,date:"2026-07-26",schedule_ids:["series-other"]}));
  const items=projectBankInstallments([],[],month("2026-09"),[...two,...other]);
  expect(items).toHaveLength(2);expect(plan(items,month("2026-09")).total).toBe(241);
  expect(new Set(items.map(row=>row.id)).size).toBe(2);
 });
 it("never attributes undated or foreign-currency values to the real budget",()=>{
  const rows=[{...two[0],currency:null},{...three[0],currency:"USD"}];
  expect(plan(projectBankInstallments([],[],month("2026-09"),rows),month("2026-09")).total).toBe(0);
  expect(projectBankInstallments([],[],{...month("2026-09"),from:"2026-09-10"},two)).toEqual([]);
 });
 it("hides the provider's undated duplicate even when the selected future month is after the series ends",()=>{
  const schedule:BankAgendaItem={id:"series-new",kind:"installment",resource_id:"fixture-card",description:"Loja Exemplo",amount:"120.50",currency:null,due_date:null,total_installments:2,resource_name:"Fixture",institution_name:"Fixture bank",synced_at:"2026-08-04"};
  expect(unrepresentedBankSchedules([schedule],[],[],two.flatMap(row=>row.schedule_ids))).toEqual([]);
  const projection=projectBankInstallments([],[],month("2026-09"),two);
  expect(unrepresentedBankSchedules([schedule],[],projection)).toEqual([]);
 });
});

it("reuses positively identified provider fragments and their category without counting two forecasts",()=>{
 const row=purchase("fixture-fragment",4,6,"2026-09","88.33","fragment-two");
 const group:BankAgendaItem={id:"fragment-one",source_schedule_ids:["fragment-one","fragment-two"],kind:"installment",resource_id:"fixture-card",description:"Fixture Cloud Provider",amount:"88.34",currency:null,due_date:null,total_installments:6,resource_name:"Fixture",institution_name:"Fixture bank",synced_at:"2026-08-04",user_category:"Tecnologia",purchase_date:row.date};
 const historical:BankInstallmentAnchor={id:"fragment-one",resource_id:"fixture-card",description:group.description,resource_name:"Fixture",institution_name:"Fixture bank",amount:"88.34",currency:"BRL",bill_month:"2026-08-01",observed_installments:3,total_installments:6,synced_at:"2026-08-04"};
 const linked=linkScheduledBankInstallments([row],[group]);
 const forecast=projectBankInstallments([historical],[],month("2026-09"),linked);
 expect(forecast).toHaveLength(1);expect(forecast[0]).toMatchObject({amount:"88.33",user_category:"Tecnologia",source_schedule_ids:["fragment-one","fragment-two"]});
});
