import type {BankOverview,BankBill} from "./open-finance-display";
const normalize=(s:string)=>s.normalize("NFD").replace(/\p{Diacritic}/gu,"").toLowerCase();
const months=["janeiro","fevereiro","marco","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
export type BillRequest={month:string|null;bankWords:string[];last4:string|null;today:string;mode:"personal"|"business"|"both"|null};
export function parseBillRequest(message:string,today:string):BillRequest|null {
  const text=normalize(message);
  if(text.length>500||! /\bfatura\b/.test(text)||/\b(pague|paga|pagar|registre|registra|lance|lanca|exclua|apague|cancele)\b/.test(text))return null;
  if(!/\b(envia|envie|enviar|mande|manda|mandar|quero|preciso|mostre|mostrar|ver|pdf|baixe|baixar)\b/.test(text)&&!/^fatura (?:do|de|da|dos) /.test(text))return null;
  let month:string|null=null;
  const explicit=text.match(/\b(0?[1-9]|1[0-2])[/-](20\d{2})\b/);
  const named=months.findIndex(name=>new RegExp(`\\b${name}\\b`).test(text));
  if(explicit)month=`${explicit[2]}-${explicit[1].padStart(2,"0")}`;
  else if(named>=0)month=`${text.match(/\b20\d{2}\b/)?.[0]??today.slice(0,4)}-${String(named+1).padStart(2,"0")}`;
  else if(/mes (?:passado|anterior)/.test(text)){const [y,m]=today.split("-").map(Number);month=new Date(Date.UTC(y,m-2,1)).toISOString().slice(0,7);}
  else if(/(?:este|esse|nesse|neste) mes|mes atual/.test(text))month=today.slice(0,7);
  const last4=text.match(/\bfinal\s*(\d{4})\b/)?.[1]??null;
  const ignored=new Set(["pra","para","mim","em","arquivo","documento","mande-me","me","a","o","as","os","minha","meu","minhas","meus","eu","voce","pode","poderia","por","favor","envia","envie","enviar","mande","manda","mandar","quero","preciso","mostre","mostrar","ver","pdf","baixe","baixar","fatura","cartao","cartoes","credito","do","de","da","dos","das","banco","bancaria","pessoal","empresa","empresarial","pf","pj","mes","passado","anterior","atual","este","esse","nesse","neste","final",...months]);
  const bankWords=text.split(/[^a-z0-9]+/).filter(word=>word.length>1&&!/^\d+$/.test(word)&&!ignored.has(word));
  const personal=/\b(pessoal|pf)\b/.test(text),business=/\b(empresa|empresarial|pj)\b/.test(text);
  return {month,bankWords,last4,today,mode:personal&&business?"both":personal?"personal":business?"business":null};
}
export function selectBankBill(data:BankOverview,request:BillRequest):{bill?:BankBill;choices:BankBill[]}{
  if(data.truncated)return {choices:[]};
  const cards=data.resources.filter(resource=>resource.resource_type==="card"&&(!request.last4||resource.identification_last4===request.last4)&&request.bankWords.every(word=>normalize(`${data.connections.find(c=>c.id===resource.connection_id)?.institution_name??""} ${resource.name}`).includes(word)));
  let choices=data.bills.filter(b=>cards.some(c=>c.id===b.resource_id)&&(!request.month||b.due_date?.startsWith(request.month)));
  if(!request.month){
    choices=cards.flatMap(card=>{
      const bills=choices.filter(b=>b.resource_id===card.id);
      const current=bills.filter(b=>b.due_date?.startsWith(request.today.slice(0,7)));
      return current.length?current:bills.sort((a,b)=>(b.due_date??"").localeCompare(a.due_date??"")).slice(0,1);
    });
  }
  return {bill:choices.length===1?choices[0]:undefined,choices};
}
