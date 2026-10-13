import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {expect,it} from "vitest";
import FinanceBankSchedules from "./FinanceBankSchedules";
import type {BankOverview} from "@/lib/open-finance-display";
const overview:BankOverview={connections:[],resources:[],limits:[],bills:[],credit:[],sync:[]};
it("shows received recurring/observed installments as forecasts without manual paid/delete actions",()=>{
 const html=renderToStaticMarkup(React.createElement(FinanceBankSchedules,{overview,items:[{id:"fake",kind:"installment",description:"Mercado fictício",institution_name:"Banco fictício",resource_name:"Gold",due_date:null,amount:"49.90",currency:null,synced_at:"2026-10-11",observed_installments:2,total_installments:12}]}));
 expect(html).toContain("Mercado fictício");expect(html).toContain("Banco fictício");expect(html).toContain("2 de 12");expect(html).toContain("10 parcela");expect(html).toContain("Moeda não informada");expect(html).not.toContain("R$ 49");expect(html).not.toContain("<button");expect(html).toContain("não são somadas");
});
