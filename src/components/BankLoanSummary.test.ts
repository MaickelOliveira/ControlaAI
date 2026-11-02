import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {expect,it} from "vitest";
import BankLoanSummary from "./BankLoanSummary";
import {bankMoney,type BankOverview} from "@/lib/open-finance-display";

const overview={connections:[{id:"bank",institution_name:"Banco fictício",status:"active"}],resources:[
 {id:"car",connection_id:"bank",resource_type:"financing",name:"Financiamento do veículo"},
 {id:"personal",connection_id:"bank",resource_type:"loan",name:"Crédito pessoal"},
 {id:"unknown",connection_id:"bank",resource_type:"loan",name:"Contrato sem posição"},
],credit:[
 {resource_id:"car",currency:"BRL",contract_amount:"40000",outstanding_amount:"12000",next_installment_amount:"850",due_date:"2030-08-10"},
 {resource_id:"personal",currency:"BRL",contract_amount:"5000",outstanding_amount:"3000",next_installment_amount:null,due_date:null},
],bills:[],limits:[],sync:[]} as unknown as BankOverview;
const html=(data=overview,filters?:{categories:string[]})=>renderToStaticMarkup(React.createElement(BankLoanSummary,{overview:data,filters}));

it("renders separate vehicle and loan categories, with debt charts and bank-provided installments",()=>{
 const result=html();
 expect(result).toContain("Parcelas do veículo");expect(result).toContain("Empréstimos");
 expect(result).toContain(bankMoney("12000","BRL"));expect(result).toContain(bankMoney("3000","BRL"));
 expect(result).not.toContain(bankMoney("15000","BRL"));
 expect(result).toContain(bankMoney("850","BRL"));expect(result).toContain('role="img"');
 expect(result).toContain("Vencimento final do contrato");expect(result).toContain("10/08/2030");
 expect(result).toContain("não indica a data da próxima parcela");
});
it("keeps vehicle category filtering separate from personal loans",()=>{
 const result=html(overview,{categories:["Parcelas do veículo"]});
 expect(result).toContain("Financiamento do veículo");expect(result).not.toContain("Crédito pessoal");
 expect(result).not.toContain("Contrato sem posição");
});
it("does not create zero balances, installment dates or charts for missing data",()=>{
 const result=html({...overview,resources:overview.resources.filter(r=>r.id==="unknown"),credit:[]});
 expect(result).toContain("Não informado");expect(result).toContain("moeda não informada");
 expect(result).not.toContain('role="img"');expect(result).not.toContain(bankMoney("0","BRL"));
 expect(html({...overview,resources:[],credit:[]})).toBe("");
});
