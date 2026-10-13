import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {expect,it} from "vitest";
import DashboardRecentMovements from "./DashboardRecentMovements";
import FinanceLedgerRows from "./FinanceLedgerRows";
import {createFinanceLedger,ledgerBalance} from "@/lib/finance-ledger";
import type {BankMovement} from "@/lib/open-finance-report";

const movement:BankMovement={id:"account",resource_name:"Conta fictícia",institution_name:"Banco fictício",resource_type:"account",date:"2026-10-13",description:"Débito da conta",amount:"250.00",currency:"BRL",direction:"debit",classification:"unknown",kind:"account_debits",bill_month:null,installment_number:null,installment_count:null};

function renderBoth(movements:BankMovement[]){
  const entries=createFinanceLedger([],movements,"personal");
  const dashboard=renderToStaticMarkup(createElement(DashboardRecentMovements,{entries:entries.filter(e=>e.included)}));
  const finance=renderToStaticMarkup(createElement(FinanceLedgerRows,{entries,selectMode:false,selectedIds:new Set<string>(),onToggle:()=>{},onEdit:()=>{},onDelete:()=>{},displayDescription:text=>text,displayDate:entry=>entry.date}));
  return {entries,dashboard,finance};
}

it("shows one card credit and one account debit consistently, with no double minus or extra income",()=>{
  const {entries,dashboard,finance}=renderBoth([movement,{...movement,id:"card",resource_type:"card",description:"Crédito do cartão",direction:"credit",kind:"credits"}]);
  for(const html of [dashboard,finance]){
    expect(html).toMatch(/text-emerald-ink[^>]*>\+R\$\s?250,00/);
    expect(html).toMatch(/text-(?:red|rose)-ink[^>]*>−R\$\s?250,00/);
    expect(html).not.toMatch(/−-R\$|--R\$/);
    expect(html).toContain("Crédito no cartão · não é receita");
  }
  expect(entries).toHaveLength(2);
  expect(ledgerBalance(entries)).toEqual({income:0,expense:0,balance:0});
});

it("keeps separate equal-value purchases and card reversals in the calculation",()=>{
  const {entries,dashboard}=renderBoth([{...movement,id:"purchase-1",resource_type:"card",kind:"card_purchases",classification:"purchase"},{...movement,id:"purchase-2",resource_type:"card",kind:"card_purchases",classification:"purchase"},{...movement,id:"refund",resource_type:"card",direction:"credit",kind:"credits",classification:"refund"}]);
  expect(entries).toHaveLength(3);
  expect(ledgerBalance(entries)).toEqual({income:0,expense:250,balance:-250});
  expect(dashboard.match(/−R\$\s?250,00/g)).toHaveLength(2);
  expect(dashboard.match(/\+R\$\s?250,00/g)).toHaveLength(1);
});

it("keeps identified bill payments in history and outside the spending result",()=>{
  const {entries,finance,dashboard}=renderBoth([movement,{...movement,id:"card-payment",resource_type:"card",direction:"credit",kind:"excluded",classification:"bill_payment"}].map(m=>({...m,kind:"excluded",classification:"bill_payment"})));
  expect(entries).toHaveLength(2);
  expect(entries.every(e=>!e.included)).toBe(true);
  expect(ledgerBalance(entries)).toEqual({income:0,expense:0,balance:0});
  expect(finance).toContain("Não altera o resultado");
  expect(dashboard).toContain("Nenhuma movimentação neste período.");
});
