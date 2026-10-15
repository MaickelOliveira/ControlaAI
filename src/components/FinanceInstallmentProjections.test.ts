import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {expect,it} from "vitest";
import FinanceInstallmentProjections from "./FinanceInstallmentProjections";

it("mostra a parcela prevista junto ao extrato sem chamá-la de paga ou criar data exata",()=>{
 const html=renderToStaticMarkup(createElement(FinanceInstallmentProjections,{items:[{id:"schedule",resource_id:"card",description:"LOJAS G",resource_name:"Gold",institution_name:"Sicredi",amount:"74.79",currency:"BRL",bill_month:"2026-10-01",observed_installments:2,total_installments:10,synced_at:"2026-10-15T12:00:00Z",month:"2026-11",position:3,total:10,observed:false}]}));
 expect(html).toContain("LOJAS G");
 expect(html).toContain("3 de 10");
 expect(html).toContain("novembro de 2026");
 expect(html).toContain("R$ 74,79");
 expect(html).toContain("dia do vencimento não informado");
 expect(html).toContain("fora dos gastos confirmados");
 expect(html).not.toContain("✓ Pago");
});
