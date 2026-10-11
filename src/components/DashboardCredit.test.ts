import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {expect,it} from "vitest";
import DashboardCredit from "./DashboardCredit";
import type {BankOverview} from "@/lib/open-finance-display";
const overview:BankOverview={connections:[{id:"c",institution_name:"Banco exemplo",status:"active",provider_status:null,scopes:[],consent_expires_at:null,revoked_at:null,last_successful_sync_at:null,created_at:"2026-10-10"}],resources:[{id:"card",connection_id:"c",resource_type:"card",name:"Cartão empresa",subtype:null,card_network:null,identification_last4:"1234",currency:"BRL",available_amount:null,gross_amount:null,net_amount:null,valuation_date:null,synced_at:"2026-10-10"}],limits:[{id:"line1",resource_id:"card",line_name:"Total",consolidation_type:"CONSOLIDADO",currency:"BRL",available_amount:"500",used_amount:"500",total_amount:"1000",is_flexible:false},{id:"line2",resource_id:"card",line_name:"Compras",consolidation_type:"COMPARTILHADO",currency:"BRL",available_amount:"500",used_amount:"500",total_amount:"1000",is_flexible:false}],bills:[],credit:[],sync:[]};
it("shows each shared credit line without manufacturing a combined available limit",()=>{
  const html=renderToStaticMarkup(React.createElement(DashboardCredit,{overview})).replace(/\s/g," ");
  expect(html).toContain("Total");expect(html).toContain("Compras");expect(html).toContain("R$ 500,00");expect(html).not.toContain("R$ 1.000,00");expect(html).toContain("sem somar");
});
it("does not display zero credit when the bank did not provide a limit",()=>{
  const html=renderToStaticMarkup(React.createElement(DashboardCredit,{overview:{...overview,limits:[]}}));
  expect(html).toContain("não enviou limites");expect(html).not.toContain("R$ 0,00");
});
