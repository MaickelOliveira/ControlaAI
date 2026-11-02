import {expect,it} from "vitest";
import {financeBankSchedules,unrepresentedBankSchedules} from "./finance-bank-schedules";
import {bankFilterValue} from "./finance-bank-filter";
import type {LedgerEntry} from "./finance-ledger";
import type {BankAgendaItem} from "./open-finance-schedules";
const item:BankAgendaItem={id:"fixture",kind:"recurring",description:"Assinatura música",resource_id:"card-a",resource_name:"Gold",institution_name:"Banco fictício",due_date:"2026-10-15",amount:"29.90",currency:"BRL",synced_at:"2026-10-11"};
const filters={from:"2026-10-01",to:"2026-10-31",type:"all",search:"",categories:[]};
it("includes received bank recurring predictions with an empty manual list, excluding the bill itself",()=>{
 expect(financeBankSchedules([item,{...item,id:"bill",kind:"bill"},{...item,id:"later",due_date:"2026-11-15"}],filters).map(row=>row.id)).toEqual(["fixture"]);
});
it("keeps one bank selection across all cards and preserves distinct banks",()=>{
 expect(financeBankSchedules([item,{...item,id:"second",resource_id:"card-b"},{...item,id:"other",institution_name:"Another bank"}],{...filters,account:bankFilterValue(item.institution_name)}).map(row=>row.id)).toEqual(["fixture","second"]);
});
it("does not repeat a represented schedule or hide unrelated actual ledger records",()=>{
 const entry={id:"actual",date:item.due_date,description:item.description,amount:29.90,bank:{resource_id:item.resource_id,currency:"BRL"}} as LedgerEntry;
 expect(unrepresentedBankSchedules([item],[entry],[])).toEqual([]);
 expect(unrepresentedBankSchedules([item],[{...entry,bank:{...entry.bank!,resource_id:"other-card"}}],[])).toHaveLength(1);
 expect(unrepresentedBankSchedules([item],[{...entry,date:"2026-10-01"}],[])).toHaveLength(1);
 expect(entry.id).toBe("actual");
});
it("filters a selected card by resource ID, never by bank name or amount",()=>{
 const rows=[item,{...item,id:"another",resource_id:"card-b"}];
 expect(financeBankSchedules(rows,{...filters,account:"bank:card-a"}).map(row=>row.id)).toEqual(["fixture"]);
 expect(financeBankSchedules(rows,{...filters,account:"manual:card-a"})).toEqual([]);
 expect(financeBankSchedules(rows,{...filters,account:"unlinked"})).toEqual([]);
});
it("keeps unknown installment dates visible without treating observations as paid",()=>{
 const rows=financeBankSchedules([{...item,id:"parcel",kind:"installment",due_date:null,observed_installments:12,total_installments:12}],filters);
 expect(rows).toHaveLength(1);expect(rows[0].due_date).toBeNull();expect(rows[0].observed_installments).toBe(12);
});
it("does not invent income or categories for bank forecasts",()=>{
 expect(financeBankSchedules([item],{...filters,type:"income"})).toEqual([]);
 expect(financeBankSchedules([item],{...filters,categories:["Serviços"]})).toEqual([]);
});
it("matches accent-insensitive description, card or institution search",()=>{
 expect(financeBankSchedules([item],{...filters,search:"musica"})).toHaveLength(1);
 expect(financeBankSchedules([item],{...filters,search:"ficticio"})).toHaveLength(1);
 expect(financeBankSchedules([item],{...filters,search:"Gold"})).toHaveLength(1);
 expect(financeBankSchedules([item],{...filters,search:"outra loja"})).toEqual([]);
});
it("excludes false delivery subscriptions and installments finished before the selected month",()=>{
 const rows:BankAgendaItem[]=[
  {...item,id:"delivery",description:"Zé Delivery",due_date:"2026-10-20"},
  {...item,id:"expired",kind:"installment",description:"Óticas Fam",due_date:null,observed_installments:3,total_installments:3,last_observed_month:"2026-08-01",last_observed_installment:3},
  {...item,id:"current",kind:"installment",description:"Loja atual",due_date:null,observed_installments:2,total_installments:10,last_observed_month:"2026-10-01",last_observed_installment:2},
 ];
 expect(financeBankSchedules(rows,filters).map(row=>row.id)).toEqual(["current"]);
 expect(financeBankSchedules(rows,{...filters,from:"2026-08-01",to:"2026-08-31"}).map(row=>row.id)).toContain("expired");
});
