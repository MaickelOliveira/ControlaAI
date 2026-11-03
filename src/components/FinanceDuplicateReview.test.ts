import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {expect,it} from "vitest";
import FinanceDuplicateReview from "./FinanceDuplicateReview";
import type {LedgerEntry} from "@/lib/finance-ledger";
it("shows readable comparison groups, origin and the close control without removing records",()=>{
 const base={type:"expense",amount:50,date:"2026-11-03",mode:"personal",included:true,status:"posted",possibleDuplicate:true,category:"Outros"};
 const rows=[{...base,id:"chat",source:"whatsapp",description:"Compra registrada"},{...base,id:"bank:purchase",source:"bank",description:"Loja fictícia",bank:{institution_name:"Banco fictício",resource_type:"card"}}] as LedgerEntry[];
 const html=renderToStaticMarkup(React.createElement(FinanceDuplicateReview,{entries:rows,visibleEntries:rows,onClose:()=>{}}));
 expect(html).toContain("<dialog");expect(html).toContain("Fechar");expect(html).toContain("2 registros");expect(html).toContain("WhatsApp");expect(html).toContain("Banco fictício");expect(html).toContain("Loja fictícia");expect(html).toContain("Nenhum lançamento foi excluído");
});
