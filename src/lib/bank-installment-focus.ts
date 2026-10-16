import {bankDate,bankMoney,bankAmountWithoutCurrency} from "./open-finance-display";
import {normalizeBankText} from "./bank-question-parser";
import {bankAmountTotals} from "./bank-question-answer";
import {weekBoundsBR} from "./date-br";
import {bankInstallmentPosition,type BankAgenda,type BankAgendaItem} from "./open-finance-schedules";

export type BankInstallmentFocus={kind:"future-dated"|"next-by-card"|"position"|"undated-valued"|"separate-annuity"|"due-next-week"|"missing-total"};
const safe=(text:string)=>text.replace(/[\r\n*`_~<>]/g," ").trim().slice(0,100);
const isAnnuity=(item:BankAgendaItem)=>/\b(?:anuidade|anualidade|annual fee)\b/.test(normalizeBankText(item.description));
const amount=(item:BankAgendaItem)=>item.currency?bankMoney(item.amount,item.currency):`${bankAmountWithoutCurrency(item.amount)} (moeda não informada)`;
const label=(item:BankAgendaItem)=>`${safe(item.institution_name)} · ${safe(item.resource_name)} · ${safe(item.description)}`;
const listed=(rows:BankAgendaItem[],format:(item:BankAgendaItem)=>string,limit=10)=>`${rows.slice(0,limit).map(format).join("\n")||"Nenhum item correspondente recebido."}${rows.length>limit?`\nMais ${rows.length-limit} item(ns) em Contas.`:""}`;

/** Narrow, read-only questions whose requested filter must not be lost by the model. */
export function parseBankInstallmentFocus(message:string):BankInstallmentFocus|null{
 const text=normalizeBankText(message).replace(/[?.!]+$/g,"");
 if(text.length>300||/\b(?:pague|pagar|cancele|exclua|altere|cadastre|registre)\b/.test(text))return null;
 if(/\b(?:parcelas?|parcelamentos?)\b/.test(text)&&/\bcart(?:ao|oes)\b/.test(text)&&/\b(?:proxima semana|semana que vem)\b/.test(text)&&/\b(?:vence|vencem|vencimento|quanto)\b/.test(text))return {kind:"due-next-week"};
 if(/\b(?:parcelas?|parcelamentos?)\b/.test(text)
  && /\b(?:nao tem|sem|nao possuem?)\b/.test(text)
  && /\b(?:numero total|quantidade total|total (?:de )?parcelas?)\b/.test(text))return {kind:"missing-total"};
 if(/\b(?:separe|separar|separado|distinga|diferencie)\b/.test(text)&&/\banuidade\b/.test(text)&&/\bcompras? parcelad[ao]s?\b/.test(text))return {kind:"separate-annuity"};
 if(/\b(?:compras? parcelad[ao]s?|parcelamentos?)\b/.test(text)&&/\b(?:futura|futuras|futuro|futuros)\b/.test(text)&&/\b(?:data|vencimento)\b/.test(text))return {kind:"future-dated"};
 if(/\b(?:proxima|proximas) parcelas?\b/.test(text)&&/\b(?:cada|por) cartao\b/.test(text))return {kind:"next-by-card"};
 if(/\bcompras? parcelad[ao]s?\b/.test(text)&&/\b(?:quantidade total|total de parcelas)\b/.test(text)&&/\bultima parcela\b/.test(text))return {kind:"position"};
 if(/\bparcelas?\b/.test(text)&&/\bvalor informado\b/.test(text)&&/\b(?:vencimento|data) (?:desconhecido|desconhecida|nao informado|nao informada)\b/.test(text))return {kind:"undated-valued"};
 return null;
}

export function formatBankInstallmentFocus(agenda:BankAgenda,focus:BankInstallmentFocus,today:string,modeLabel:string):string{
 const all=agenda.items.filter(item=>item.kind==="installment");
 const purchases=all.filter(item=>!isAnnuity(item));
 const appendix=agenda.incomplete?"\nConsulta bancária incompleta; pode haver dados em atualização ou indisponíveis.":"";
 const caveat="\nAs parcelas identificadas não confirmam pagamento nem datas futuras que o banco não informou.";
 switch(focus.kind){
  case "missing-total":{
   const missing=all.filter(item=>{
    const total=item.total_installments;
    return typeof total!=="number"||!Number.isInteger(total)||total<1||total>1000;
   });
   return `Parcelas bancárias sem número total informado · ${safe(modeLabel)} · ${missing.length} item(ns)\n${missing.length?listed(missing,item=>`• ${label(item)} · ${bankInstallmentPosition(item)} · ${amount(item)} por parcela`):"Nenhuma parcela sem número total apareceu nos dados recebidos."}${appendix}\nIsso não prova que os bancos não tenham outros parcelamentos; a consulta mostra apenas os dados recebidos.${caveat}`;
  }
  case "future-dated":{
   const dated=purchases.filter(item=>item.due_date&&item.due_date>today).sort((a,b)=>a.due_date!.localeCompare(b.due_date!));
   const undated=purchases.filter(item=>!item.due_date).length;
   return `Compras parceladas recebidas dos bancos com parcela futura datada · ${safe(modeLabel)}\n${listed(dated,item=>`• ${label(item)} · ${bankInstallmentPosition(item)} · ${amount(item)} · vencimento ${bankDate(item.due_date)}`)}\n${undated} compra(s) parcelada(s) sem data ficaram fora; não é possível afirmar quando vencerão.${appendix}${caveat}`;
  }
  case "next-by-card":{
   const cards=new Map<string,BankAgendaItem[]>();
   for(const item of all){const key=item.resource_id??`${item.institution_name}|${item.resource_name}`;cards.set(key,[...(cards.get(key)??[]),item]);}
   const lines=[...cards.values()].map(rows=>{
    const cardPurchases=rows.filter(item=>!isAnnuity(item));
    const next=cardPurchases.filter(item=>item.due_date&&item.due_date>today).sort((a,b)=>a.due_date!.localeCompare(b.due_date!))[0];
    const card=`${safe(rows[0].institution_name)} · ${safe(rows[0].resource_name)}`;
    return next?`• ${card}: ${safe(next.description)} · ${bankInstallmentPosition(next)} · ${amount(next)} · vencimento ${bankDate(next.due_date)}`:`• ${card}: não recebi próxima parcela com data para compra parcelada (${cardPurchases.filter(item=>!item.due_date).length} compra(s) sem data).`;
   });
   return `Próxima parcela datada recebida dos bancos por cartão · ${safe(modeLabel)}\n${lines.slice(0,12).join("\n")||"Nenhuma parcela de cartão recebida."}${lines.length>12?`\nMais ${lines.length-12} cartão(ões) em Contas.`:""}${appendix}${caveat}`;
  }
  case "position":
   return `Última parcela identificada de cada compra parcelada recebida dos bancos · ${safe(modeLabel)} · ${purchases.length} item(ns)\n${listed(purchases,item=>`• ${label(item)} · ${bankInstallmentPosition(item)} · ${amount(item)} por parcela`)}${appendix}\nAnuidades ficaram separadas das compras. Compras com a mesma descrição podem ser distintas; a posição não confirma pagamento.`;
  case "undated-valued":{
   const rows=all.filter(item=>!item.due_date&&item.amount!==null&&item.amount!==undefined&&/^-?\d+(?:\.\d+)?$/.test(String(item.amount)));
   return `Parcelas bancárias com valor informado e vencimento desconhecido · ${safe(modeLabel)} · ${rows.length} item(ns)\n${listed(rows,item=>`• ${label(item)} · ${bankInstallmentPosition(item)} · ${amount(item)}`)}${appendix}\nSem data recebida, não consigo dizer quando serão cobradas nem se já foram pagas.`;
  }
  case "separate-annuity":{
   const fees=all.filter(isAnnuity);
   const short=(rows:BankAgendaItem[])=>listed(rows,item=>`• ${label(item)} · ${bankInstallmentPosition(item)} · ${amount(item)}`,8);
   return `Anuidades e compras parceladas recebidas dos bancos · ${safe(modeLabel)}\n\nAnuidades (${fees.length})\n${short(fees)}\n\nCompras parceladas (${purchases.length})\n${short(purchases)}${appendix}\nA mesma descrição não prova duplicidade; confira os lançamentos no banco. Valores de anuidades não foram somados às compras.`;
  }
  case "due-next-week":{
   const nextWeek=new Date(`${today}T12:00:00`);
   nextWeek.setDate(nextWeek.getDate()+7);
   const [from,to]=weekBoundsBR(nextWeek);
   const dated=all.filter(item=>item.due_date&&item.due_date>=from&&item.due_date<=to).sort((a,b)=>a.due_date!.localeCompare(b.due_date!));
   const undated=all.filter(item=>!item.due_date).length;
   const totals=bankAmountTotals(dated.map(item=>({amount:item.amount,currency:item.currency})),agenda.incomplete||undated>0);
   return `Parcelas de cartão com vencimento recebido de ${bankDate(from)} a ${bankDate(to)} · ${safe(modeLabel)}\n${dated.length?listed(dated,item=>`• ${label(item)} · ${bankInstallmentPosition(item)} · ${amount(item)} · ${bankDate(item.due_date)}`):"Nenhuma parcela com data recebida para a próxima semana; não há valor confirmado para somar."}${dated.length?`\n${totals.join("\n")||"Os valores recebidos não têm moeda confiável para soma."}`:""}\n${undated} parcela(s) sem data ficaram fora da consulta; não é possível dizer se vencem nessa semana.${appendix}${caveat}`;
  }
 }
}
