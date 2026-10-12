import {expect,it} from "vitest";
import {financeAccountKey,financeAccountOptions,matchesFinanceAccount} from "./finance-account-filter";
import {createFinanceLedger} from "./finance-ledger";
import type {BankMovement} from "./open-finance-report";
const movement={id:"m",resource_id:"same-id",resource_name:"Conta corrente",institution_name:"Banco teste",resource_type:"account",date:"2026-10-11",description:"Compra",amount:"20",currency:"BRL",direction:"debit",classification:"purchase",kind:"account_debits",bill_month:null,installment_number:null,installment_count:null} as BankMovement;
const records=[{id:"manual",type:"expense",amount:10,category:"Outros",description:"Manual",date:"2026-10-11",mode:"personal",accountId:"same-id"},{id:"none",type:"income",amount:40,category:"Salário",description:"Receita",date:"2026-10-11",mode:"personal"}];
it("filters manual accounts and bank products by scoped IDs, never by duplicated labels",()=>{
 const entries=createFinanceLedger(records,[movement,{...movement,id:"second",resource_id:"different-id"}],"personal");
 expect(entries.filter(e=>matchesFinanceAccount(e,"bank:same-id"))).toHaveLength(1);
 expect(entries.filter(e=>matchesFinanceAccount(e,"manual:same-id"))).toHaveLength(1);
 expect(entries.filter(e=>matchesFinanceAccount(e,"unlinked"))).toHaveLength(1);
 expect(entries.filter(e=>matchesFinanceAccount(e,"bank:missing"))).toHaveLength(0);
 expect(entries.every(e=>matchesFinanceAccount(e,""))).toBe(true);
});
it("includes named manual accounts, every bank account/card and unlinked records with unique values",()=>{
 const finances=createFinanceLedger(records,[movement],"personal");
 const data={finances,accounts:[{id:"same-id",name:"Conta manual",type:"bank"}],bank:{overview:{connections:[{id:"c",institution_name:"Banco teste"}],resources:[{id:"same-id",connection_id:"c",resource_type:"account",name:"Conta corrente"},{id:"different-id",connection_id:"c",resource_type:"card",name:"Gold",identification_last4:"1234"}]}}};
 const options=financeAccountOptions(data as never);
 expect(options.map(o=>o.value)).toEqual(expect.arrayContaining(["manual:same-id","bank:same-id","bank:different-id","unlinked"]));
 expect(new Set(options.map(o=>o.value)).size).toBe(options.length);
 expect(options.find(o=>o.value==="bank:different-id")?.label).toContain("1234");
 expect(financeAccountKey(finances.find(e=>e.id==="none")!)).toBe("unlinked");
});
