import {expect,it} from "vitest";
import {createFinanceLedger,type LedgerEntry} from "./finance-ledger";
import {financeMovementDisplay} from "./finance-movement-display";
import type {BankMovement} from "./open-finance-report";

const movement:BankMovement={id:"fixture",resource_name:"Conta fictícia",institution_name:"Banco fictício",resource_type:"account",date:"2026-10-13",description:"Movimentação fictícia",amount:"100.00",currency:"BRL",direction:"debit",classification:"unknown",kind:"account_debits",bill_month:null,installment_number:null,installment_count:null};
const display=(bank:BankMovement)=>financeMovementDisplay(createFinanceLedger([],[bank],"personal")[0]);

it("does not invent a sign or currency when the bank omits them",()=>{
  expect(display({...movement,direction:"unknown"})).toMatchObject({direction:"unknown",sign:""});
  expect(display({...movement,amount:null})).toMatchObject({amount:"Não informado",sign:""});
  expect(display({...movement,currency:null}).amount).toBe("Não informado");
  expect(display({...movement,currency:"USD"}).amount).toMatch(/US\$\s?100,00/);
});

it("shows confirmed credit-funded payment charges instead of the original gross expense",()=>{
  const result=display({...movement,resource_type:"card",source_type:"OPERACOES_CREDITO_CONTRATADAS_CARTAO",credit_reconciliation:{id:"00000000-0000-4000-8000-000000000099",status:"active",role:"credit",gross_amount:"100.00",payment_amount:"90.00",charges_amount:"10.00"}});
  expect(result).toMatchObject({direction:"debit",sign:"−",note:null});
  expect(result.amount).toMatch(/R\$\s?10,00/);
});

it.each([
  ["income",100,"credit","+"], ["expense",100,"debit","−"],
  ["income",-100,"debit","−"], ["expense",-100,"credit","+"],
])("shows the signed direction of a manual %s amount %s",(type,amount,direction,sign)=>{
  const entry:LedgerEntry={id:"manual",type,amount,description:"Registro fictício",category:"Outros",date:"2026-10-13",mode:"personal",source:"web",included:true,possibleDuplicate:false};
  const result=financeMovementDisplay(entry);
  expect(result).toMatchObject({direction,sign,note:null});
  expect(result.amount).toMatch(/^R\$\s?100,00$/);
});
