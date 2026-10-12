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
it("matches Zé Delivery with accents and bank separators without including another merchant",()=>{
  const purchases=createFinanceLedger([], [
    {...bank("ze1","31.25","debit","card","card_purchases"),description:"ZE*DELIVERY COMPRA"},
    {...bank("ze2","12.50","debit","card","card_purchases"),description:"Zé Delivery"},
    {...bank("other","99","debit","card","card_purchases"),description:"Outra loja"},
  ], "personal");
  const answer=summarizeFinanceQuery(purchases,{from:"2026-09-01",to:"2026-09-30",type:"expense",keywords:["ze delivery","zedelivery"]},"personal");
  expect(answer).toContain("R$ 43,75"); expect(answer).toContain("Estabelecimento"); expect(answer).toContain("DELIVERY COMPRA"); expect(answer).not.toContain("Outra loja");
});
it("shows transfers, original currencies and unknown amounts in an extract without adding them to expense totals",()=>{
  const movements=createFinanceLedger([], [bank("expense","45"),{...bank("transfer","120","debit","account","excluded"),description:"Transferência teste"},{...bank("dollars","15"),currency:"USD",description:"Compra em dólar"},{...bank("unknown","1"),amount:null,description:"Valor ausente"}],"personal");
  const reply=summarizeFinanceQuery(movements,{from:"2026-09-01",to:"2026-09-30",type:"result",detail:true},"personal");
  expect(reply).toContain("Saídas: R$ 45,00"); expect(reply).toContain("Transferência teste"); expect(reply).toContain("Compra em dólar"); expect(reply).toMatch(/Valor ausente[^\n]*\n[^\n]*Não informado/); expect(reply).toContain("Fora do total");
});
it("organizes a merchant answer into total, period, origins and separate purchases with blank lines",()=>{
  const reply=summarizeFinanceQuery(createFinanceLedger([], [{...bank("ze","43.75","debit","card","card_purchases"),description:"Zé Delivery"}],"personal"),{from:"2026-09-01",to:"2026-09-30",type:"expense",keywords:["ze delivery"]},"personal");
  expect(reply).toMatch(/^💸 \*Você gastou R\$ 43,75\*/); expect(reply).toContain("\n\n📅"); expect(reply).toContain("\n\n*Por origem*\n"); expect(reply).toContain("\n\n*Movimentações encontradas (1)*\n\n"); expect(reply).toContain("*1. Zé Delivery*\n💰 R$ 43,75\n"); expect(reply).toContain("🏷️ Alimentação");
});

it("answers category ranking before the separate source breakdown",()=>{
 const reply=summarizeFinanceQuery(entries,{from:"2026-09-01",to:"2026-09-30",type:"expense",analysis:true},"personal");
 expect(reply).toMatch(/^🏆 \*Maior categoria/);expect(reply.indexOf("Gastos por categoria")).toBeLessThan(reply.indexOf("Por origem"));
});
