import {expect,it} from "vitest";
import {categoryForInvoiceTransaction} from "./invoice-import";
it.each(["IFD*IFOOD","ZE*DELIVERY","99 Food","ai que fome","Pedido de sushi para entrega"])("uses Delivery for recognized invoice descriptions instead of an old model category: %s",description=>{
  expect(categoryForInvoiceTransaction(description,"Alimentação")).toBe("Delivery");
});
it.each([["Pizza no restaurante","Delivery"],["Delivery de medicamentos","Saúde"],["Delivery de roupas","Vestuário"],["Mercado Pago","Outros"]])("preserves the food/non-food distinction on invoices: %s",(description,category)=>{
  expect(categoryForInvoiceTransaction(description)).toBe(category);
});
it.each(["IOF iFood","Juros do cartão Zé Delivery"])("does not turn bank charges into food purchases during invoice import: %s",description=>{
  expect(categoryForInvoiceTransaction(description)).toBe("Encargos bancários");
});
it.each(["Delivery de eletrônicos","Delivery de livros"])("rejects an automatic food-delivery suggestion contradicted by the invoice description: %s",description=>{
  expect(categoryForInvoiceTransaction(description,"Delivery")).not.toBe("Delivery");
});
