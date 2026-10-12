import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {expect,it} from "vitest";
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
