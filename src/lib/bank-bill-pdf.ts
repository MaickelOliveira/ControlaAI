import {bankDate,bankMoney} from "./open-finance-display";
export type BankBillDocument={bill:{id:string;resource_id:string;institution_name:string;resource_name:string;last4?:string|null;due_date:string|null;currency:string|null;total_amount:string|null;minimum_payment_amount:string|null;payment_amount:string|null;payment_evidence:boolean;synced_at:string};transactions:Array<{id:string;date:string|null;description:string;amount:string|null;currency:string|null;direction:string;installment_number?:number|null;installment_count?:number|null}>;transactions_complete:boolean};
function text(value:string):string {
  return value.replace(/[\r\n\t]/g," ").replace(/[–—]/g,"-").replace(/[^\x20-\x7e\xa0-\xff]/g,"?").replace(/\\/g,"\\\\").replace(/\(/g,"\\(").replace(/\)/g,"\\)");
}
function wrap(value:string,width=82):string[]{
  const words=value.replace(/[\r\n\t]/g," ").split(/\s+/),lines:string[]=[];let line="";
  for(const word of words.flatMap(raw=>raw.match(new RegExp(`.{1,${width}}`,"g"))??[])){if((line+word).length>width&&line){lines.push(line);line="";}line+=(line?" ":"")+word;}
  if(line)lines.push(line);return lines;
}
/** A self-contained PDF with standard fonts; no external assets or payment code. */
export function bankBillPdf(document:BankBillDocument,mode:"personal"|"business"):Buffer {
  const b=document.bill;
  const lines=[...wrap(`${b.institution_name} - ${b.resource_name}${b.last4?` - final ${b.last4}`:""}`),`Modo: ${mode==="business"?"Empresa":"Pessoal"} | Vencimento: ${bankDate(b.due_date)}`,`Total informado: ${bankMoney(b.total_amount,b.currency)} | Minimo: ${bankMoney(b.minimum_payment_amount,b.currency)}`,...wrap(b.payment_evidence?`Pagamentos informados pelo banco: ${bankMoney(b.payment_amount,b.currency)}. Confira a situacao no banco.`:"Pagamento não confirmado pelo banco. A ausência de pagamento não comprova atraso."),`Dados recebidos em ${bankDate(b.synced_at)}.`,"",...wrap("Demonstrativo gerado pela Zelo: não é o documento original do banco e não serve para pagamento."),...wrap(document.transactions_complete?"Itens recebidos; importação desta fatura concluída. O banco pode fornecer histórico parcial.":"Detalhamento em atualização. Este documento apresenta apenas os itens já recebidos."),"","MOVIMENTACOES RECEBIDAS",""];
  for(const row of [...document.transactions].sort((a,b)=>(a.date??"").localeCompare(b.date??"")||a.id.localeCompare(b.id))){
    const label=row.direction==="credit"?"Credito/estorno":row.direction==="debit"?"Debito":"Natureza nao informada";
    lines.push(...wrap(`${bankDate(row.date)} | ${label} | ${bankMoney(row.amount,row.currency)}${row.installment_number?` | Parcela ${row.installment_number}/${row.installment_count??"?"}`:""} | ${row.description}`));
  }
  if(!document.transactions.length)lines.push("Nenhuma movimentacao recebida para esta fatura ate agora.");
  const pages:Array<string[]>=[];for(let i=0;i<lines.length;i+=44)pages.push(lines.slice(i,i+44));
  const objects:string[]=["<< /Type /Catalog /Pages 2 0 R >>","", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>","<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>"];
  const pageIds:number[]=[];
  for(let index=0;index<pages.length;index++){
    const pageId=objects.length+1,contentId=pageId+1;pageIds.push(pageId);
    const commands=["0.97 0.75 0 rg 36 793 523 5 re f","0.05 0.1 0.2 rg","BT /F1 18 Tf 40 765 Td (Demonstrativo Zelo) Tj ET","BT /F2 10 Tf 14 TL 40 733 Td",...pages[index].map((line,i)=>`${i?"T* ":""}(${text(line)}) Tj`),"ET",`BT /F1 9 Tf 40 55 Td (Zelo | Dados privados do titular | Pagina ${index+1}/${pages.length}) Tj ET`].join("\n");
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`,`<< /Length ${Buffer.byteLength(commands,"latin1")} >>\nstream\n${commands}\nendstream`);
  }
  objects[1]=`<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map(id=>`${id} 0 R`).join(" ")}] >>`;
  let output="%PDF-1.4\n%\xe2\xe3\xcf\xd3\n";const offsets:number[]=[0];
  for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(output,"latin1"));output+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}
  const start=Buffer.byteLength(output,"latin1");output+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.slice(1).map(offset=>`${String(offset).padStart(10,"0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return Buffer.from(output,"latin1");
}
