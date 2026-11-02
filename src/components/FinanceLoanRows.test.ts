import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {expect,it} from "vitest";
import FinanceLoanRows from "./FinanceLoanRows";
it("puts each unrecorded installment in a simple read-only statement row, without inventing an amount or payment day",()=>{
 const base={id:"l",name:"Crédito pessoal",bank:"Banco fictício",category:"Empréstimos",currency:"BRL",amount:150,month:"2026-11"};
 const html=renderToStaticMarkup(React.createElement(FinanceLoanRows,{items:[base,{...base,id:"paid",recordedId:"entry",name:"Already posted"},{...base,id:"car",category:"Parcelas do veículo",amount:null}]}));
 expect(html).toContain("150,00");expect(html).toContain("11/2026");expect(html).toContain("Parcela prevista");expect(html).toContain("Valor não informado");expect(html).toContain("vencimento não informado");expect(html).not.toContain("Already posted");expect(html).not.toContain("<button");expect(html).not.toContain("Saldo devedor");
});
it("offers manual entry only when enabled and missing, and allows editing an existing monthly plan",()=>{
 const base={id:"car",resourceId:"car",name:"Veículo",bank:"Banco fictício",category:"Parcelas do veículo",currency:"BRL",amount:null,month:"2026-11"};
 const html=renderToStaticMarkup(React.createElement(FinanceLoanRows,{items:[base],mode:"personal",canEdit:true}));
 expect(html).toContain("Informar parcela");
 const manualPlan={resource_id:"car",amount:"890.10",currency:"BRL",first_due_date:"2026-09-10",last_due_date:"2027-05-10"};
 const manual=renderToStaticMarkup(React.createElement(FinanceLoanRows,{items:[{...base,amount:890.1,dueDate:"2026-11-10",manualPlan}],mode:"personal",canEdit:true}));
 expect(manual).toContain("Editar parcela");expect(manual).toContain("informada por você");expect(manual).toContain("10/11/2026");
});
