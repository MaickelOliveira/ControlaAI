import {expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
import {bankBillPdf,type BankBillDocument} from "./bank-bill-pdf";
it("produces a parseable multi-page PDF, labels missing coverage, and escapes source descriptions",async()=>{
  const bill:BankBillDocument={bill:{id:"b",resource_id:"r",institution_name:"Banco Teste",resource_name:"Cartão",due_date:"2026-10-15",currency:"BRL",total_amount:"500",minimum_payment_amount:"50",payment_amount:null,payment_evidence:false,synced_at:"2026-10-10T00:00:00Z"},transactions:Array.from({length:70},(_,i)=>({id:String(i),date:"2026-10-01",description:"Compra (teste) \\ \nprivado",amount:"10",currency:"BRL",direction:"debit"})),transactions_complete:false};
  const buffer=bankBillPdf(bill,"personal");
  expect(buffer.subarray(0,8).toString()).toBe("%PDF-1.4");
  const {getDocument}=await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc=await getDocument({data:new Uint8Array(buffer),useSystemFonts:true}).promise;
  expect(doc.numPages).toBeGreaterThan(1);
  const text=(await Promise.all(Array.from({length:doc.numPages},async(_,i)=>(await (await doc.getPage(i+1)).getTextContent()).items.map(item=>"str" in item?item.str:"").join(" ")))).join(" ");
  expect(text).toContain("Demonstrativo Zelo");expect(text).toContain("Detalhamento em atualização");expect(text).toContain("não é o documento original");expect(text).toContain("Compra (teste)");
  await doc.destroy();
},20000);
