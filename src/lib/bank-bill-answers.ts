import {bankDate,bankMoney,type BankBill,type BankConnection,type BankOverview,type BankResource} from "./open-finance-display";
import {normalizeBankText} from "./bank-question-parser";
import {isBankBillPaymentDescription} from "./bank-bill-payment";
import type {LedgerEntry} from "./finance-ledger";

export type BillQuestion = {kind:"overdue"|"latest"|"total"|"minimum"|"next"|"undated"|"separate"|"confirmed-payment"|"partial-payment"|"missing";bankName?:string;requestedCurrent?:boolean};

export function paidBillHistoryAnswer(message:string):string|null{
 const text=normalizeBankText(message);
 if(!/\bfaturas?\b/.test(text)||!/\b(?:quitad[ao]s?|pagas?)\b/.test(text)||!/\b(?:extrato|historico|aparecer|continuar)\b/.test(text)||/\b(?:pague|pagar|cancele|exclua)\b/.test(text))return null;
 return "Sim. Uma fatura quitada pode continuar no histórico e no extrato. Se o banco informar o pagamento, a Zelo pode mostrar essa confirmação; se não informar, o estado do pagamento permanece desconhecido. A presença no histórico não prova que você ainda deve esse valor. Confira no banco antes de pagar novamente.";
}

export function closedBillAnswer(message:string):string|null{
 const text=normalizeBankText(message);
 if(!/\bfatura fechada\b/.test(text)||!/\bcompra em aberto\b/.test(text)||!/\b(?:diferenca|compare|explique)\b/.test(text))return null;
 return "Fatura fechada reúne as compras de um ciclo encerrado e informa o valor cobrado naquele fechamento; isso não significa que já foi paga. Compra em aberto ainda não entrou numa fatura fechada e pode aparecer no ciclo atual ou no próximo, conforme a data e as regras do cartão. Não some uma compra à fatura sem conferir se ela já está incluída nela.";
}

/** Only clear, read-only bill questions bypass the general classifier. */
export function parseBillQuestion(message:string):BillQuestion|null{
 const text=normalizeBankText(message).replace(/[?.!]+$/g,"");
 if(text.length>300||/\b(?:pague|pagar|cancele|exclua|altere|cadastre)\b/.test(text))return null;
 if(/\bfaturas?\b/.test(text)&&/\bbancos?\b/.test(text)&&/\b(?:confirmaram?|informaram?)\b/.test(text)&&/\bpagamentos?\b/.test(text))return {kind:"confirmed-payment"};
 if(/\bfaturas?\b/.test(text)&&/\bpagamentos? parciais?\b/.test(text))return {kind:"partial-payment"};
 if(/\bfaturas?\b/.test(text)&&/\bempresa\b/.test(text)&&/\bsem misturar com (?:o )?pessoal\b/.test(text))return {kind:"latest"};
 if(/\bfaturas?\b/.test(text)&&/\bcartoes\b/.test(text)&&/\b(?:nao enviaram|sem dados|sem fatura)\b/.test(text))return {kind:"missing"};
 if(/\b(?:separe|separado|diferenc[ie]|distinga|compare|versus|vs)\b/.test(text)&&/\bfaturas?\b/.test(text)&&/\bcompras?\b/.test(text)&&/\bcart(?:ao|oes)\b/.test(text))return {kind:"separate"};
 if(/\bfaturas?\b/.test(text)&&/\b(?:ja venceram|vencidas?|atrasadas?)\b/.test(text)&&/\b(?:pagamento|paga|pagas|confirmad[oa]s?)\b/.test(text))return {kind:"overdue"};
 if(/\bfaturas?\b/.test(text)&&/\b(?:atual|mais recente|ultima)\b/.test(text)&&/\b(?:cada|por banco|todos os cartoes)\b/.test(text))return {kind:"latest",requestedCurrent:/\batual\b/.test(text)};
 const total=text.match(/^(?:qual (?:e )?o |quanto (?:e|foi) o )?(?:total|valor) (?:informado )?da fatura (?:do|da) (.+)$/);
 if(total&&total[1].length<=80)return {kind:"total",bankName:total[1].replace(/^banco /,"")};
 if(/\bminimo\b/.test(text)&&/\bfaturas?\b/.test(text))return {kind:"minimum"};
 if(/\bfaturas?\b/.test(text)&&(/\bvencimento mais proximo\b/.test(text)||/\bproxima fatura\b/.test(text)||/\bfatura a vencer\b/.test(text)))return {kind:"next"};
 if(/\bfaturas?\b/.test(text)&&/\b(?:sem|nao (?:tem|informaram?)) (?:data de )?vencimento\b/.test(text))return {kind:"undated"};
 return null;
}

type BillRow={bill:BankBill;card:BankResource;bank:BankConnection};
const safe=(value:string)=>value.replace(/[\r\n*`_~<>]/g," ").trim().slice(0,100);
function billRows(overview:BankOverview):BillRow[]{
 const active=new Map(overview.connections.filter(c=>c.status==="active"&&!c.archived_at).map(c=>[c.id,c]));
 const cards=new Map(overview.resources.filter(r=>r.resource_type==="card"&&active.has(r.connection_id)).map(r=>[r.id,r]));
 return overview.bills.flatMap(bill=>{
  const card=cards.get(bill.resource_id),bank=card&&active.get(card.connection_id);
  return card&&bank?[{bill,card,bank}]:[];
 });
}
function latestPerCard(rows:BillRow[]):BillRow[]{
 const sorted=[...rows].sort((a,b)=>(b.bill.due_date??"").localeCompare(a.bill.due_date??"")||(b.bill.synced_at??"").localeCompare(a.bill.synced_at??""));
 const seen=new Set<string>();return sorted.filter(row=>{if(seen.has(row.card.id))return false;seen.add(row.card.id);return true;});
}
function cardLabel(row:BillRow):string{
 return `${safe(row.bank.institution_name)} · ${safe(row.card.name)}${row.card.identification_last4?` final ${row.card.identification_last4}`:""}`;
}
function amount(row:BillRow,value:"total_amount"|"minimum_payment_amount"):string{return bankMoney(row.bill[value],row.bill.currency);}
function listed(lines:string[]):string{return `${lines.slice(0,20).join("\n")}${lines.length>20?`\nMais ${lines.length-20} item(ns); veja Contas.`:""}`;}
function positive(value:string|number|null|undefined):number|null{const n=Number(value);return value!==null&&value!==undefined&&Number.isFinite(n)&&n>0?n:null;}
function partialStatus(status:string):boolean{return /^(?:partial|partially_paid|partial_payment|parcial)$/i.test(status);}
function paymentReported(row:BillRow):boolean{return row.bill.payment_evidence===true||positive(row.bill.payment_amount)!==null||/^(?:paid|pago|paga|settled|liquidado|quitado)$/i.test(row.bill.status)||partialStatus(row.bill.status);}
function partiallyPaid(row:BillRow):boolean{
 if(/^(?:paid|pago|paga|settled|liquidado|quitado)$/i.test(row.bill.status))return false;
 if(partialStatus(row.bill.status))return true;
 const paid=positive(row.bill.payment_amount),total=positive(row.bill.total_amount);
 return paid!==null&&total!==null&&paid<total;
}
function partialPaymentConflict(row:BillRow):"equal"|"greater"|null{
 const paid=positive(row.bill.payment_amount),total=positive(row.bill.total_amount);
 if(paid===null||total===null)return null;
 const difference=Math.round(paid*100)-Math.round(total*100);
 if(difference===0&&(partialStatus(row.bill.status)||paid<total))return "equal";
 return difference>0&&partialStatus(row.bill.status)?"greater":null;
}

/** Payment state is evidence, never inferred from a missing bank confirmation. */
export function answerBillQuestion(overview:BankOverview,question:BillQuestion,today:string,mode:"personal"|"business",entries?:readonly LedgerEntry[]):string{
 if(!Array.isArray(overview.connections)||!Array.isArray(overview.resources)||!Array.isArray(overview.bills))throw Error("BANK_BILLS_UNAVAILABLE");
 let rows=billRows(overview);
 if(question.bankName){const wanted=normalizeBankText(question.bankName);rows=rows.filter(row=>normalizeBankText(row.bank.institution_name).includes(wanted));}
 const latest=latestPerCard(rows);
 const label=mode==="business"?"Empresa":"Pessoal";
 let result:string[]=[];
 switch(question.kind){
  case "separate":{
   if(!entries)throw Error("BANK_CARD_PURCHASES_UNAVAILABLE");
   const monthStart=`${today.slice(0,7)}-01`;
   const active=new Map(overview.connections.filter(c=>c.status==="active"&&!c.archived_at).map(c=>[c.id,c]));
   const latestByCard=new Map(latest.map(row=>[row.card.id,row]));
   result=overview.resources.filter(card=>card.resource_type==="card"&&active.has(card.connection_id)).map(card=>{
    const bank=active.get(card.connection_id)!;
    const row=latestByCard.get(card.id);
    const purchases=entries.filter(entry=>entry.source==="bank"&&entry.bank?.resource_id===card.id&&entry.bank.resource_type==="card"&&entry.bank.direction==="debit"&&entry.included&&entry.status!=="pending"&&entry.date>=monthStart&&entry.date<=today&&!isBankBillPaymentDescription(entry.description));
    const cents=purchases.reduce((sum,entry)=>sum+Math.round(entry.amount*100),0);
    return `• ${safe(bank.institution_name)} · ${safe(card.name)}${card.identification_last4?` final ${card.identification_last4}`:""}\n  ${row?`Última fatura recebida: ${amount(row,"total_amount")} · vencimento ${bankDate(row.bill.due_date)}`:"Fatura não informada pelo banco"}\n  Compras recebidas no extrato deste mês: ${purchases.length?`${bankMoney(cents/100,"BRL")} em ${purchases.length} compra(s)`:"nenhuma compra em BRL contabilizável recebida"}`;
   });
   return `Fatura e compras de cartão · ${label}\n${listed(result)||"Nenhum cartão conectado com dados recebidos."}\nSão informações diferentes: o extrato do mês pode incluir compras de outro ciclo. Compras sem valor ou moeda confiável ficam fora da soma. Não some esses valores para calcular dívida; confira a fatura e os pagamentos no banco.`;
  }
  case "confirmed-payment":{
   const confirmed=rows.filter(paymentReported).sort((a,b)=>(b.bill.due_date??"").localeCompare(a.bill.due_date??""));
   const seen=new Set<string>();
   result=confirmed.filter(row=>{if(seen.has(row.bank.id))return false;seen.add(row.bank.id);return true;})
    .map(row=>`• ${safe(row.bank.institution_name)} · fatura com vencimento ${bankDate(row.bill.due_date)} · pagamento informado${positive(row.bill.payment_amount)!==null?` ${bankMoney(row.bill.payment_amount,row.bill.currency)}`:" (valor não informado)"}${partialPaymentConflict(row)?" · dados de pagamento inconsistentes":partiallyPaid(row)?" · parcial":""}`);
   return `Bancos com pagamento de fatura informado · ${label}\n${listed(result)||"Nenhum banco conectado informou pagamento de fatura nos registros recebidos."}\nAusência de confirmação não prova que não foram pagas. Um pagamento parcial informado não confirma a quitação total.`;
  }
  case "partial-payment":{
   const candidates=rows.filter(partiallyPaid).sort((a,b)=>(b.bill.due_date??"").localeCompare(a.bill.due_date??""));
   result=candidates.filter(row=>!partialPaymentConflict(row)).map(row=>`• ${cardLabel(row)} · vencimento ${bankDate(row.bill.due_date)} · pagamento parcial informado ${positive(row.bill.payment_amount)!==null?bankMoney(row.bill.payment_amount,row.bill.currency):"Não informado"} · total da fatura ${amount(row,"total_amount")}`);
   const conflicts=candidates.flatMap(row=>{
    const conflict=partialPaymentConflict(row);
    return conflict?[`• ${cardLabel(row)} · vencimento ${bankDate(row.bill.due_date)} · ${partialStatus(row.bill.status)?"banco marcou como parcial, mas informou pagamento":"pagamento informado aparece"} ${conflict==="equal"?"igual ao total":"maior que o total"} (${bankMoney(row.bill.payment_amount,row.bill.currency)} de ${amount(row,"total_amount")}); dados contraditórios, não dá para confirmar saldo em aberto ou quitação`]:[];
   });
   const partials=result.length?`Pagamentos parciais informados nas faturas · ${label}\n${listed(result)}`:conflicts.length?`Nenhum pagamento parcial confiável informado nas faturas recebidas · ${label}.`:`Pagamentos parciais informados nas faturas · ${label}\nNenhum pagamento parcial informado nas faturas recebidas.`;
   return `${partials}${conflicts.length?`\n\nRegistros contraditórios (fora da lista de parciais)\n${listed(conflicts)}`:""}\nEssa lista não confirma saldo a pagar nem quitação. Confira a fatura no banco, principalmente quando os dados recebidos forem contraditórios.`;
  }
  case "missing":{
   const active=new Map(overview.connections.filter(c=>c.status==="active"&&!c.archived_at).map(c=>[c.id,c]));
   const withBills=new Set(rows.map(row=>row.card.id));
   result=overview.resources.filter(card=>card.resource_type==="card"&&active.has(card.connection_id)&&!withBills.has(card.id))
    .map(card=>`• ${safe(active.get(card.connection_id)!.institution_name)} · ${safe(card.name)}${card.identification_last4?` final ${card.identification_last4}`:""}`);
   return `Cartões sem fatura recebida · ${label}\n${listed(result)||"Todos os cartões ativos consultados têm ao menos uma fatura recebida; isso não confirma que os dados estejam atualizados."}\nConfira Contas para ver a última sincronização de cada banco.`;
  }
  case "overdue":
   result=latest.filter(row=>row.bill.due_date&&row.bill.due_date<today&&!/^(?:paid|pago|paga|settled|liquidado|quitado)$/i.test(row.bill.status))
    .sort((a,b)=>(b.bill.due_date??"").localeCompare(a.bill.due_date??""))
    .map(row=>`• ${cardLabel(row)} · venceu em ${bankDate(row.bill.due_date)} · total informado ${amount(row,"total_amount")} · pagamento não confirmado nos dados recebidos`);
   return `Faturas mais recentes de cada cartão com vencimento passado · ${label}\n${listed(result)||"Nenhuma fatura mais recente de cartão apareceu com vencimento passado e pagamento sem confirmação."}\nIsso não prova que exista dívida: o banco pode não ter informado o pagamento. Confira cada fatura em Contas.`;
  case "latest":
   result=latest.map(row=>question.requestedCurrent
    ?`• ${cardLabel(row)} · ${row.bill.due_date&&row.bill.due_date>=today
      ?/^(?:paid|pago|paga|settled|liquidado|quitado)$/i.test(row.bill.status)
       ?`fatura com vencimento recebido ${bankDate(row.bill.due_date)} · banco informou pagamento; não apresento valor em aberto`
       :`fatura com vencimento recebido ${bankDate(row.bill.due_date)} · total informado ${amount(row,"total_amount")}; ${partiallyPaid(row)?"pagamento parcial informado, saldo a pagar não confirmado":"pagamento não confirmado"}`
      :`não recebi fatura com vencimento de hoje em diante (último vencimento recebido ${bankDate(row.bill.due_date)})`}`
    :`• ${cardLabel(row)} · último vencimento recebido ${bankDate(row.bill.due_date)} · total ${amount(row,"total_amount")} · mínimo ${amount(row,"minimum_payment_amount")}`);
   {
    const active=new Map(overview.connections.filter(c=>c.status==="active"&&!c.archived_at).map(c=>[c.id,c]));
    const covered=new Set(latest.map(row=>row.card.id));
    for(const card of overview.resources.filter(r=>r.resource_type==="card"&&!covered.has(r.id))){
      const bank=active.get(card.connection_id);
      if(bank)result.push(`• ${safe(bank.institution_name)} · ${safe(card.name)}${card.identification_last4?` final ${card.identification_last4}`:""} · fatura não informada pelo banco`);
    }
   }
   return question.requestedCurrent
    ?`Não consigo confirmar qual fatura está aberta agora.\nFaturas recebidas por cartão · ${label}\n${listed(result)||"Nenhuma fatura recebida dos bancos conectados."}\nVencimento futuro não confirma que a fatura ainda está em aberto; faturas antigas podem já estar pagas. Confira no banco antes de pagar.`
    :`Última fatura recebida de cada cartão · ${label}\n${listed(result)||"Nenhuma fatura recebida dos bancos conectados."}\nA última fatura recebida pode já ter sido paga; não equivale ao valor em aberto.`;
  case "total":
   result=latest.map(row=>`• ${cardLabel(row)} · vencimento ${bankDate(row.bill.due_date)} · total informado ${amount(row,"total_amount")}`);
   return `Última fatura recebida ${question.bankName?`de ${safe(question.bankName)}`:""} · ${label}\n${listed(result)||"Não encontrei fatura recebida desse banco neste modo."}${result.length>1?"\nHá mais de um cartão; não somei as faturas. Diga o final do cartão se quiser apenas uma.":""}\nO total informado não confirma quanto ainda falta pagar.`;
  case "minimum":
   result=latest.map(row=>`• ${cardLabel(row)} · vencimento ${bankDate(row.bill.due_date)} · pagamento mínimo ${amount(row,"minimum_payment_amount")}`);
   return `Pagamento mínimo da última fatura recebida de cada cartão · ${label}\n${listed(result)||"Nenhum pagamento mínimo recebido dos bancos conectados."}\nMínimo informado pelo banco; confira a fatura antes de pagar.`;
  case "next":{
   const next=rows.filter(row=>row.bill.due_date&&row.bill.due_date>=today).sort((a,b)=>(a.bill.due_date??"").localeCompare(b.bill.due_date??""))[0];
   return `Próxima fatura com vencimento informado · ${label}\n${next?`• ${cardLabel(next)} · ${bankDate(next.bill.due_date)} · total ${amount(next,"total_amount")}`:"Não recebi uma fatura com vencimento futuro; isso não confirma que não haverá cobrança."}`;
  }
  case "undated":
   result=rows.filter(row=>!row.bill.due_date).map(row=>`• ${cardLabel(row)} · total ${amount(row,"total_amount")}`);
   return `Faturas recebidas sem data de vencimento · ${label}\n${listed(result)||"Nenhuma fatura recebida apareceu sem data de vencimento."}\nOs bancos podem não ter enviado todas as faturas.`;
 }
}
