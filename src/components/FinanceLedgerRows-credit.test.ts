import {expect,it} from "vitest";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import FinanceLedgerRows from "./FinanceLedgerRows";
import {createFinanceLedger} from "@/lib/finance-ledger";
import type {BankMovement} from "@/lib/open-finance-report";
it("makes the financial expense explicit while retaining the original card charge in the history",()=>{
 const movement:BankMovement={id:"credit",resource_name:"Fictitious card",institution_name:"Fictitious bank",resource_type:"card",date:"2026-09-10",description:"Fictitious credit",amount:"850.16",currency:"BRL",direction:"debit",classification:"unknown",kind:"other",source_type:"OPERACOES_CREDITO_CONTRATADAS_CARTAO",bill_month:null,installment_number:null,installment_count:null,credit_reconciliation:{id:"00000000-0000-4000-8000-000000000099",status:"active",role:"credit",gross_amount:"850.16",payment_amount:"821.48",charges_amount:"28.68"}};
 const text=renderToStaticMarkup(createElement(FinanceLedgerRows,{entries:createFinanceLedger([],[movement],"personal"),selectMode:false,selectedIds:new Set<string>(),onToggle:()=>{},onEdit:()=>{},onDelete:()=>{},displayDescription:text=>text,displayDate:entry=>entry.date}));
 expect(text).toMatch(/−R\$\s?28,68/);
 expect(text).toContain("Cobrança no cartão:");expect(text).toMatch(/R\$\s?850,16/);
 expect(movement.amount).toBe("850.16");
});
it("labels a confirmed own-account transfer as outside the result while keeping the bank row visible",()=>{
 const movement:BankMovement={id:"own-transfer",resource_name:"Conta",institution_name:"Banco teste",resource_type:"account",date:"2026-10-15",description:"Pix enviado",amount:"100.00",currency:"BRL",direction:"debit",classification:"unknown",kind:"account_debits",user_category:"Transferência entre contas próprias",bill_month:null,installment_number:null,installment_count:null};
 const text=renderToStaticMarkup(createElement(FinanceLedgerRows,{entries:createFinanceLedger([],[movement],"personal"),selectMode:false,selectedIds:new Set<string>(),onToggle:()=>{},onEdit:()=>{},onDelete:()=>{},onCategory:()=>{},displayDescription:value=>value,displayDate:entry=>entry.date}));
 expect(text).toContain("Transferência entre contas próprias");
 expect(text).toContain("Não altera o resultado");
 expect(text).toContain("Alterar categoria");
 expect(text).not.toContain("Valor/direção não informados");
});
it("shows the manual account that received a WhatsApp expense",()=>{
 const entry={id:"expense",type:"expense",amount:90,category:"Saúde",description:"Farmacia",date:"2026-10-15",mode:"personal",source:"whatsapp" as const,accountId:"cash"};
 const text=renderToStaticMarkup(createElement(FinanceLedgerRows,{entries:createFinanceLedger([entry],[],"personal"),accounts:[{id:"cash",name:"Dinheiro"}],selectMode:false,selectedIds:new Set<string>(),onToggle:()=>{},onEdit:()=>{},onDelete:()=>{},displayDescription:value=>value,displayDate:item=>item.date}));
 expect(text).toContain("Farmacia");
 expect(text).toContain("WhatsApp");
 expect(text).toContain("Conta: Dinheiro");
});
