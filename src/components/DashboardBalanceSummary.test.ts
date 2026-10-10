import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {expect,it} from "vitest";
import DashboardBalanceSummary from "./DashboardBalanceSummary";
import {createFinanceLedger,ledgerBalance} from "@/lib/finance-ledger";
import type {BankMovement} from "@/lib/open-finance-report";

it("shows one period balance from bank, card, WhatsApp and platform activity",()=>{
  const movement:BankMovement={id:"account",resource_type:"account",resource_name:"Conta",institution_name:"Banco teste",date:"2026-10-10",description:"Recebimento",amount:"1000.30",currency:"BRL",direction:"credit",classification:"unknown",kind:"credits",bill_month:null,installment_number:null,installment_count:null};
  const entries=createFinanceLedger([
    {id:"whatsapp",type:"expense",amount:20.10,category:"Alimentação",description:"Almoço",date:"2026-10-10",mode:"business",source:"whatsapp"},
    {id:"platform",type:"income",amount:200,category:"Serviços",description:"Serviço",date:"2026-10-10",mode:"business",source:"web"},
  ],[movement,{...movement,id:"card",resource_type:"card",kind:"card_purchases",direction:"debit",amount:"80.20"}],"business");
  const html=renderToStaticMarkup(React.createElement(DashboardBalanceSummary,{balance:ledgerBalance(entries)}));
  expect(html).toContain("Saldo do período");
  expect(html.replace(/\s/g," ")).toContain("R$ 1.100,00");
  expect(html).toContain("Conta, cartão, WhatsApp e plataforma");
  expect(html).not.toContain("Saldo bancário");
  expect(html).not.toContain("registros manuais acumulados");
});

it("identifies an outflow surplus as a negative result without inventing available cash",()=>{
  const html=renderToStaticMarkup(React.createElement(DashboardBalanceSummary,{balance:{income:100,expense:150.10,balance:-50.10}}));
  expect(html.replace(/\s/g," ")).toContain("-R$ 50,10");
  expect(html).toContain("Saídas acima das entradas");
  expect(html).toContain("Entradas menos saídas no período selecionado");
});
