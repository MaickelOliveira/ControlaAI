import {expect,it} from "vitest";
import {financeBankSchedules} from "./finance-bank-schedules";
import type {BankAgendaItem} from "./open-finance-schedules";
const item:BankAgendaItem={id:"fixture",kind:"recurring",description:"Assinatura música",resource_id:"card-a",resource_name:"Gold",institution_name:"Banco fictício",due_date:"2026-10-15",amount:"29.90",currency:"BRL",synced_at:"2026-10-11"};
const filters={from:"2026-10-01",to:"2026-10-31",type:"all",search:"",categories:[]};
it("includes received bank recurring predictions with an empty manual list, excluding the bill itself",()=>{
 expect(financeBankSchedules([item,{...item,id:"bill",kind:"bill"},{...item,id:"later",due_date:"2026-11-15"}],filters).map(row=>row.id)).toEqual(["fixture"]);
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
