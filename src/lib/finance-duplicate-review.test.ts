import {expect,it} from "vitest";
import {financeDuplicateGroups} from "./finance-duplicate-review";
import {createFinanceLedger,ledgerBalance} from "./finance-ledger";
import type {BankMovement} from "./open-finance-report";
const bank={id:"bank-purchase",resource_id:"card",resource_name:"Cartão",institution_name:"Banco fictício",resource_type:"card",date:"2026-11-03",description:"Loja",amount:"50",currency:"BRL",direction:"debit",kind:"card_purchases",classification:"purchase",bill_month:"2026-11",installment_number:null,installment_count:null,user_category:"Vestuário"} as BankMovement;
const records=[{id:"chat",type:"expense",amount:50,category:"Outros",description:"Compra lançada pelo WhatsApp",date:"2026-11-03",mode:"personal",source:"whatsapp" as const}];
it("opens the matching cross-origin records together even when a category filter hides the counterpart",()=>{
 const entries=createFinanceLedger(records,[bank],"personal"),before=structuredClone(entries);
 const groups=financeDuplicateGroups(entries,entries.filter(row=>row.category==="Outros"));
 expect(groups).toHaveLength(1);expect(groups[0].entries.map(row=>row.id).sort()).toEqual(["bank:bank-purchase","chat"]);
 expect(entries).toEqual(before);expect(ledgerBalance(entries).expense).toBe(100);
});
it("does not conflate different dates, directions, values or bank-only same-value purchases",()=>{
 const entries=createFinanceLedger(records,[bank,{...bank,id:"other-date",date:"2026-11-02"},{...bank,id:"other-value",amount:"51"},{...bank,id:"refund",direction:"credit"}],"personal");
 expect(financeDuplicateGroups(entries)[0].entries).toHaveLength(2);
 expect(financeDuplicateGroups(createFinanceLedger([],[bank,{...bank,id:"second"}],"personal"))).toEqual([]);
 expect(financeDuplicateGroups(entries,entries.filter(row=>row.id==="bank:other-value"))).toEqual([]);
});
