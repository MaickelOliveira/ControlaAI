import {expect,it} from "vitest";
import {parseBillRequest,selectBankBill} from "./open-finance-bill-selection";
import type {BankOverview} from "./open-finance-display";
const data={connections:[{id:"c",institution_name:"Banco Inter PJ",status:"active"}],resources:[{id:"card",connection_id:"c",resource_type:"card",name:"MEI"}],bills:[{id:"oct",resource_id:"card",due_date:"2026-10-15"},{id:"sep",resource_id:"card",due_date:"2026-09-15"}]} as BankOverview;
it("recognizes a request to send a card statement and selects the requested bank and month",()=>{
  const request=parseBillRequest("me envia a fatura do cartão Inter de setembro de 2026","2026-10-11");
  expect(request?.month).toBe("2026-09");expect(selectBankBill(data,request!).bill?.id).toBe("sep");
});
it("asks for a choice instead of selecting a different bank or one of multiple cards",()=>{
  const many={...data,resources:[...data.resources,{id:"other",connection_id:"c",resource_type:"card",name:"Outro"}],bills:[...data.bills,{id:"other-oct",resource_id:"other",due_date:"2026-10-15"}]} as BankOverview;
  expect(selectBankBill(many,parseBillRequest("quero minha fatura","2026-10-11")!).bill).toBeUndefined();
  expect(selectBankBill(data,parseBillRequest("envia a fatura do cartão Nubank","2026-10-11")!).bill).toBeUndefined();
});
it("does not interpret a payment order or an invoice registration as a request to send a bill",()=>{
  expect(parseBillRequest("pague a fatura do cartão","2026-10-11")).toBeNull();
  expect(parseBillRequest("registre essa fatura","2026-10-11")).toBeNull();
});
it("leaves requests about card purchases and bill payments to the finance answer",()=>{
  expect(parseBillRequest("Mostre compras de cartão do mês sem pagamentos de fatura.","2026-10-15")).toBeNull();
  expect(parseBillRequest("Quero ver pagamentos de fatura do mês fora dos gastos.","2026-10-15")).toBeNull();
  expect(parseBillRequest("Me envie a fatura do cartão Nubank de outubro.","2026-10-15")).not.toBeNull();
});
