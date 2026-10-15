import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {expect,it,vi} from "vitest";
vi.mock("@/lib/date-br",()=>({todayStrBR:()=>"2026-10-15"}));
import OpenFinanceResources from "./OpenFinanceResources";
import type {BankOverview,BankResource} from "@/lib/open-finance-display";
const resource:BankResource={id:"r",connection_id:"c",resource_type:"card",name:"Cartão",subtype:null,card_network:null,identification_last4:null,currency:"BRL",available_amount:null,gross_amount:null,net_amount:null,valuation_date:null,synced_at:"2026-10-10"};
const overview:BankOverview={connections:[],resources:[resource],limits:[{id:"l",resource_id:"r",line_name:"Saque",consolidation_type:null,currency:"BRL",total_amount:"100",used_amount:"50",available_amount:"50",is_flexible:false}],bills:[],credit:[],sync:[]};
function summary(data:BankOverview){return renderToStaticMarkup(React.createElement(OpenFinanceResources,{data,mode:"personal"})).match(/<summary>([\s\S]*?)<\/summary>/)?.[1]??"";}
it("identifies a specific credit line instead of implying a general card limit",()=>{expect(summary(overview)).toContain("Disponível · Saque");});
it("does not present an unknown loan position as available cash",()=>{const html=summary({...overview,resources:[{...resource,resource_type:"loan",name:"Empréstimo"}],limits:[]});expect(html).toContain("Saldo devedor");expect(html).toContain("Não informado");expect(html).not.toContain("Saldo disponível");});

it("hides confirmed zero debt contracts but keeps unknown debt and zero cash balances",()=>{
 const data:BankOverview={...overview,resources:[{...resource,id:"zero",resource_type:"loan",name:"Contrato zerado teste"},{...resource,id:"unknown",resource_type:"financing",name:"Contrato sem posição"},{...resource,id:"cash",resource_type:"account",name:"Conta sem saldo",available_amount:"0"},{...resource,id:"tiny",resource_type:"loan",name:"Saldo pequeno"}],limits:[],credit:[{resource_id:"zero",outstanding_amount:"0.00000000",currency:"BRL",contract_amount:"100",next_installment_amount:null,due_date:null},{resource_id:"tiny",outstanding_amount:"0.00000001",currency:"BRL",contract_amount:null,next_installment_amount:null,due_date:null}]};
 const html=renderToStaticMarkup(React.createElement(OpenFinanceResources,{data,mode:"personal"}));
 expect(html).not.toContain("Contrato zerado teste"); expect(html).toContain("Contrato sem posição"); expect(html).toContain("Conta sem saldo"); expect(html).toContain("Saldo pequeno");
});
it("keeps Nubank purchases and expired installments out of current recurring schedules",()=>{
 const base={resource_id:"r",resource_name:"platinum",institution_name:"Nubank",synced_at:"2026-10-15"};
 const data:BankOverview={...overview,agenda:{items:[
  {...base,id:"ze",kind:"recurring",description:"Zé Delivery",due_date:"2026-11-11",amount:"51.07",currency:"BRL"},
  {...base,id:"old",kind:"installment",description:"Óticas Fam",due_date:null,amount:"116.66",currency:null,observed_installments:3,total_installments:3,last_observed_month:"2025-12-01",last_observed_installment:3},
  {...base,id:"netflix",kind:"recurring",description:"Netflix",due_date:"2026-11-04",amount:"20.90",currency:"BRL"},
 ],incomplete:false}};
 const html=renderToStaticMarkup(React.createElement(OpenFinanceResources,{data,mode:"personal"}));
 expect(html).toContain("Netflix");expect(html).not.toContain("Zé Delivery");expect(html).not.toContain("Óticas Fam");
 expect(html).toContain("Recorrências e parcelas · 1");
});
