import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {expect,it} from "vitest";
import DashboardCredit from "./DashboardCredit";
import OpenFinanceResources from "./OpenFinanceResources";
import type {BankConnection,BankLimit,BankOverview,BankResource} from "@/lib/open-finance-display";

function connection(id:string,name:string):BankConnection {
  return {id,institution_name:name,status:"active",provider_status:"AUTHORISED",scopes:["CREDIT_CARD_ACCOUNT"],consent_expires_at:null,revoked_at:null,last_successful_sync_at:null,created_at:"2026-10-11"};
}
function card(id:string,connection_id:string):BankResource {
  return {id,connection_id,resource_type:"card",name:"Cartão fictício",subtype:"credit-cards",card_network:null,identification_last4:null,currency:null,available_amount:null,gross_amount:null,net_amount:null,valuation_date:null,synced_at:"2026-10-11"};
}
function limit(id:string,resource_id:string,available_amount:string|null,line_name="CREDITO_A_VISTA"):BankLimit {
  return {id,resource_id,line_name,consolidation_type:"INDIVIDUAL",currency:"BRL",available_amount,total_amount:null,used_amount:null,is_flexible:false};
}
const render=(data:BankOverview)=>renderToStaticMarkup(React.createElement(DashboardCredit,{overview:data})).replace(/\s/g," ");

it("does not let the first card's two zero lines hide positive credit received for other banks",()=>{
  const data:BankOverview={
    connections:[connection("a","Banco Alfa fictício"),connection("b","Banco Beta fictício"),connection("c","Banco Gama fictício")],
    resources:[card("card-a","a"),card("card-b","b"),card("card-c","c")],
    limits:[limit("a-total","card-a","321.45"),limit("a-cash","card-a","0","SAQUE_CREDITO_BRASIL"),limit("a-abroad","card-a","0","SAQUE_CREDITO_EXTERIOR"),limit("b-total","card-b","875.25"),limit("c-total","card-c","412.80")],
    bills:[],credit:[],sync:[],
  };
  const html=render(data);
  expect(html).toContain("Banco Beta fictício");expect(html).toContain("875,25");
  expect(html).toContain("Banco Gama fictício");expect(html).toContain("412,80");
  expect(html).toContain("321,45");expect(html).not.toContain("1.609,50");
});

it("keeps a card with unavailable limits visible when another bank did supply a limit",()=>{
  const html=render({connections:[connection("a","Banco Alfa fictício"),connection("b","Banco sem limite fictício")],resources:[card("card-a","a"),card("card-b","b")],limits:[limit("a-total","card-a","321.45")],bills:[],credit:[],sync:[]});
  expect(html).toContain("Banco sem limite fictício");
  expect(html.toLowerCase()).toMatch(/não (?:informad|envi)/);
  expect(html).not.toContain("R$ 0,00");
});

it("does not make an arbitrary unknown first line the only card-summary value when a later line has reported credit",()=>{
  const data:BankOverview={connections:[connection("a","Banco fictício")],resources:[card("card-a","a")],limits:[limit("unknown-first","card-a",null,"SAQUE_CREDITO_BRASIL"),limit("known-second","card-a","2840.75")],bills:[],credit:[],sync:[]};
  const html=renderToStaticMarkup(React.createElement(OpenFinanceResources,{data,mode:"personal"}));
  const summary=html.match(/<summary>([\s\S]*?)<\/summary>/)?.[1]??"";
  expect(summary).toContain("2.840,75");
  expect(summary).not.toContain("R$ 0,00");
});
