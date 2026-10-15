import {expect,it} from "vitest";
import {createFinanceLedger,ledgerBalance,ledgerExpenseGroups,ledgerCategoryGroups} from "./finance-ledger";
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
it("does not count unmistakable card-bill settlement descriptions when the provider omitted their classification",()=>{
 const entries=createFinanceLedger([], [
  {...bank,id:"generic",description:"Pagamento de fatura",amount:"100.00"},
  {...bank,id:"account",description:"DEBITO AUT. FAT.CARTAO MASTER CARD FINAL 6129",amount:"90.00"},
  {...bank,id:"card",resource_type:"card",direction:"credit",kind:"credits",description:"DEB. AUTOM. DE FATURA EM C/C",amount:"90.00"},
  {...bank,id:"utility",description:"Pagamento de fatura de energia",amount:"10.00"},
 ],"personal");
 expect(entries.filter(e=>!e.included)).toHaveLength(3);
 expect(ledgerBalance(entries).expense).toBe(10);
});
it("excludes only the bank movement explicitly marked as a transfer between own accounts",()=>{
 const description="Transferência enviada pelo Pix|SAMIRA";
 const entries=createFinanceLedger([], [
  {...bank,id:"confirmed-own",description,amount:"100.00",user_category:"Transferência entre contas próprias"},
  {...bank,id:"unverified",description,amount:"15.00"},
 ],"personal");
 expect(entries.find(e=>e.id==="bank:confirmed-own")).toMatchObject({included:false,category:"Transferência entre contas próprias",categorySource:"excluded"});
 expect(entries.find(e=>e.id==="bank:unverified")?.included).toBe(true);
 expect(ledgerBalance(entries)).toMatchObject({expense:15,balance:-15});
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
it("keeps refund-only and mixed negative groups visible in signed expense charts",()=>{
 const entries=createFinanceLedger([manual],[{...bank,resource_type:"card",direction:"credit",kind:"credits",amount:"10.05"}],"business");
 expect(ledgerExpenseGroups(entries,"origin")).toEqual(expect.arrayContaining([{name:"WhatsApp",value:25},{name:"Cartões",value:-10.05}]));
 expect(ledgerExpenseGroups(entries,"category").reduce((sum,g)=>sum+Math.round(g.value*100),0)).toBe(1495);
});

it("groups income categories separately from spending, preserving signed amounts and excluding pending/unknown entries",()=>{
 const entries=createFinanceLedger([{...manual,type:"income",category:"Salário",amount:30},{...manual,id:"refund-income",type:"income",category:"Salário",amount:-5},{...manual,id:"pending-income",type:"income",category:"Salário",amount:1000,status:"pending"}], [{...bank,direction:"credit",kind:"credits",description:"Reembolso",amount:"10"}],"business");
 expect(ledgerCategoryGroups(entries,"income")).toEqual(expect.arrayContaining([{name:"Salário",value:25},{name:"Reembolso",value:10}]));
 expect(ledgerCategoryGroups(entries,"expense")).toEqual([]);
});
