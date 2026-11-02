import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {expect,it} from "vitest";
import FinanceLoanRows from "./FinanceLoanRows";
it("puts each unrecorded installment in a simple read-only statement row, without inventing an amount or payment day",()=>{
 const base={id:"l",name:"Crédito pessoal",bank:"Banco fictício",category:"Empréstimos",currency:"BRL",amount:150,month:"2026-11"};
 const html=renderToStaticMarkup(React.createElement(FinanceLoanRows,{items:[base,{...base,id:"paid",recordedId:"entry",name:"Already posted"},{...base,id:"car",category:"Parcelas do veículo",amount:null}]}));
 expect(html).toContain("150,00");expect(html).toContain("11/2026");expect(html).toContain("Parcela prevista");expect(html).toContain("Valor não informado");expect(html).toContain("vencimento não informado");expect(html).not.toContain("Already posted");expect(html).not.toContain("<button");expect(html).not.toContain("Saldo devedor");
});
