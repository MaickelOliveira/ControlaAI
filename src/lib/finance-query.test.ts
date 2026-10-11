import {expect,it} from "vitest";
import {createFinanceLedger} from "./finance-ledger";
import {summarizeFinanceQuery} from "./finance-query";
import type {BankMovement} from "./open-finance-report";
const bank=(id:string,amount:string,direction="debit",resource_type="account",kind="account_debits")=>({id,amount,direction,resource_type,kind,currency:"BRL",description:"Test merchant",date:"2026-09-09",institution_name:"Test Bank",resource_name:"Resource",classification:"",bill_month:null,installment_number:null,installment_count:null}) as BankMovement;
const entries=createFinanceLedger([
  {id:"w",amount:20,type:"expense",date:"2026-09-10",description:"Lunch",category:"Alimentação",source:"whatsapp",mode:"personal"},
  {id:"p",amount:10,type:"expense",date:"2026-09-11",description:"Other",category:"Outros",source:"web",mode:"personal"},
  {id:"pending",amount:900,type:"expense",date:"2026-09-11",description:"Pending",category:"Outros",status:"pending",mode:"personal"},
  {id:"pj",amount:800,type:"expense",date:"2026-09-11",description:"Company",category:"Outros",mode:"business"},
],[bank("a","50"),bank("c","40","debit","card","card_purchases"),bank("refund","5","credit","card","credits"),bank("invoice","100","debit","account","excluded"),{...bank("usd","100"),currency:"USD"}],"personal");
it("answers from the same unified ledger including refunds and all recorded origins",()=>{
  const answer=summarizeFinanceQuery(entries,{from:"2026-09-01",to:"2026-09-30",type:"expense"},"personal");
  expect(answer).toContain("R$ 115,00");expect(answer).toContain("WhatsApp");expect(answer).toContain("Plataforma");expect(answer).toContain("Contas bancárias");expect(answer).toContain("Cartões");
  expect(answer).not.toContain("900");expect(answer).not.toContain("800");
});
it("applies source and category filters without claiming that bank debits are all card purchases",()=>{
  expect(summarizeFinanceQuery(entries,{from:"2026-09-01",to:"2026-09-30",type:"expense",source:"card"},"personal")).toContain("R$ 35,00");
  expect(summarizeFinanceQuery(entries,{from:"2026-09-01",to:"2026-09-30",type:"expense",category:"Alimentação"},"personal")).toContain("R$ 20,00");
});
it("groups income as receipts instead of expenses",()=>{
  const income=createFinanceLedger([{id:"income",amount:500,type:"income",date:"2026-09-12",description:"Salary",category:"Salário",source:"web",mode:"personal"}],[],"personal");
  const answer=summarizeFinanceQuery(income,{from:"2026-09-01",to:"2026-09-30",type:"income",analysis:true},"personal");
  expect(answer).toContain("Receitas por categoria");expect(answer).toContain("Salário: R$ 500,00");expect(answer).not.toContain("Nenhuma despesa");
});
