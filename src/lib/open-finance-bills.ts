import "server-only";
import {openFinanceRpc} from "./open-finance-http";
import {getOpenFinanceAccess,type OpenFinanceIdentity,type OpenFinanceScope} from "./open-finance-access";
import type {BankOverview} from "./open-finance-display";
import {bankDate,bankMoney} from "./open-finance-display";
import {polpUuid} from "./polp-production";
import {bankBillPdf,type BankBillDocument} from "./bank-bill-pdf";
import {parseBillRequest,selectBankBill} from "./open-finance-bill-selection";

export async function readBankBill(scope:OpenFinanceScope,billId:string):Promise<BankBillDocument>{
  polpUuid(billId);
  let after:string|null=null,document:BankBillDocument|null=null;
  const seen=new Set<string>();
  for(let page=0;page<40;page++){
    const result=await openFinanceRpc(scope,"zelo_of_bill",{p_bill:billId,p_after:after}) as BankBillDocument&{next:string|null};
    if(!result||result.bill?.id!==billId||!Array.isArray(result.transactions)||result.transactions.length>50)throw Error("OF_BILL_UNAVAILABLE");
    if(document&&(document.bill.resource_id!==result.bill.resource_id||document.bill.synced_at!==result.bill.synced_at||document.transactions_complete!==result.transactions_complete))throw Error("OF_BILL_CHANGED");
    document??={bill:result.bill,transactions:[],transactions_complete:result.transactions_complete};
    for(const row of result.transactions){if(seen.has(row.id))throw Error("OF_BILL_CHANGED");seen.add(row.id);document.transactions.push(row);}
    if(!result.next)return document;
    if(result.next===after)throw Error("OF_BILL_CURSOR");after=polpUuid(result.next);
  }
  throw Error("OF_BILL_LIMIT");
}
export async function prepareBankBill(user:OpenFinanceIdentity,mode:"personal"|"business",message:string,today:string,includeDocument=true):Promise<{text:string;billId?:string;buffer?:Buffer;filename?:string}|null>{
  const request=parseBillRequest(message,today);if(!request)return null;
  if(request.mode==="both")return {text:"Escolha uma plataforma para consultar a fatura: Pessoal (PF) ou Empresa (PJ)."};
  if(request.mode&&request.mode!==mode)return {text:`Este pedido é do modo ${request.mode==="business"?"Empresa (PJ)":"Pessoal (PF)"}. Troque para esse modo na Zelo e faça o pedido novamente.`};
  const scope=await getOpenFinanceAccess(user,mode,{throwOnStorageError:true});if(!scope)return null;
  const overview=await openFinanceRpc(scope,"zelo_of_overview",{p_environment:scope.environment}) as BankOverview;
  const selected=selectBankBill(overview,request);
  if(!selected.bill){
    const safe=(s:string)=>s.replace(/[\r\n*`_~<>]/g," ").slice(0,120);
    const options=selected.choices.slice(0,10).map(b=>{const card=overview.resources.find(r=>r.id===b.resource_id);const bank=overview.connections.find(c=>c.id===card?.connection_id);return `${safe(bank?.institution_name??"Banco")} · ${safe(card?.name??"Cartão")}${card?.identification_last4?` · final ${card.identification_last4}`:""} · vencimento ${bankDate(b.due_date)}`;});
    return {text:overview.truncated?"Há mais faturas do que consigo conferir nesta consulta. Veja o cartão em Contas para escolher o demonstrativo.":options.length?`Qual fatura você quer?\n${options.join("\n")}\nPeça o banco, o mês do vencimento e, se necessário, o final do cartão. Exemplo: envie a fatura do cartão Inter de outubro de 2026.`:"Não encontrei uma fatura recebida que corresponda ao pedido neste modo. Confira o banco, o mês do vencimento e o final do cartão em Contas; o banco pode ainda não ter enviado esses dados."};
  }
  const document=await readBankBill(scope,selected.bill.id),bill=document.bill;
  const filename=`demonstrativo-zelo-${bill.due_date??"cartao"}.pdf`;
  return {billId:bill.id,filename,buffer:includeDocument?bankBillPdf(document,mode):undefined,text:`Demonstrativo da Zelo · ${bill.institution_name.replace(/[\r\n*`_~<>]/g," ").slice(0,120)} · vencimento ${bankDate(bill.due_date)} · total informado ${bankMoney(bill.total_amount,bill.currency)}. ${document.transactions_complete?"Inclui as movimentações recebidas para esta fatura.":"O detalhamento ainda está em atualização; contém apenas os itens recebidos."} Este arquivo é gerado pela Zelo, não é a fatura original e não serve para pagamento.`};
}
