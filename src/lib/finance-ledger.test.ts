import {expect,it} from "vitest";
import {createFinanceLedger,ledgerBalance} from "./finance-ledger";
import type {BankMovement} from "./open-finance-report";
const manual={id:"manual",type:"expense",amount:25,category:"Alimentação",description:"Almoço",date:"2026-10-02",mode:"business",source:"whatsapp" as const};
const bank:BankMovement={id:"bank",resource_name:"Conta",institution_name:"Banco teste",resource_type:"account",date:"2026-10-03",description:"Pix enviado",amount:"40.10",currency:"BRL",direction:"debit",classification:"unknown",kind:"account_debits",bill_month:null,installment_number:null,installment_count:null};
it("places bank, card, WhatsApp and platform entries in one dated ledger preserving origins",()=>{
 const entries=createFinanceLedger([manual,{...manual,id:"web",source:"web"}], [bank,{...bank,id:"card",resource_type:"card",kind:"card_purchases",classification:"purchase"}],"business");
 expect(entries.map(e=>e.source)).toEqual(["bank","bank","whatsapp","web"]);
 expect(ledgerBalance(entries)).toEqual({income:0,expense:130.2,balance:-130.2});
});
it("does not count duplicated bank pages, bill settlements, investments or unknown foreign amounts",()=>{
 const entries=createFinanceLedger([], [bank,bank,{...bank,id:"bill",kind:"excluded",classification:"bill_payment"},{...bank,id:"usd",currency:"USD"},{...bank,id:"unknown",amount:null},{...bank,id:"investment",kind:"excluded",classification:"investment"}],"personal");
 expect(entries).toHaveLength(5);expect(ledgerBalance(entries).expense).toBe(40.1);
 expect(entries.find(e=>e.id==="bank:unknown")?.bank?.amount).toBeNull();
});
it("deducts card refunds from expenses instead of inflating income and excludes pending records",()=>{
 const entries=createFinanceLedger([{...manual,status:"pending"}], [{...bank,resource_type:"card",direction:"credit",kind:"credits",amount:"10.05"}],"business");
 expect(ledgerBalance(entries)).toEqual({income:0,expense:-10.05,balance:10.05});
});
it("signals possible duplicates without deleting same-day purchases or matching another mode",()=>{
 const entries=createFinanceLedger([manual,{...manual,id:"wrong",mode:"personal"}], [{...bank,date:manual.date,amount:"25.00"}],"business");
 expect(entries).toHaveLength(2);expect(entries.every(e=>e.possibleDuplicate)).toBe(true);
 expect(ledgerBalance(entries).expense).toBe(50);
});
it("does not invent direction or round an unsafe amount into a usable chart value",()=>{
 const entries=createFinanceLedger([], [{...bank,amount:"9999999999999999.12"},{...bank,id:"direction",direction:"unknown"}],"personal");
 expect(entries.every(e=>!e.included)).toBe(true);expect(ledgerBalance(entries).balance).toBe(0);
});
