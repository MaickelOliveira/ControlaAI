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
