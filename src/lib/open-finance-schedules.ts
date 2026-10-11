import { bankDate, bankMoney } from "./open-finance-display";
export type BankAgendaItem={id:string;mode?:"personal"|"business";resource_id?:string;kind:"bill"|"recurring"|"installment";description:string;resource_name:string;institution_name:string;due_date:string|null;amount:string|null;currency:string|null;synced_at:string;payment_evidence?:boolean;payment_amount?:string|null;total_installments?:number|null;observed_installments?:number|null;regularity_score?:number|null};
export type BankAgenda={items:BankAgendaItem[];incomplete:boolean};
const safe=(text:string)=>text.replace(/[\r\n*`_~<>]/g," ").slice(0,180);
export function collectBankAgenda(items:BankAgendaItem[],range:{from:string;to:string;includeUndated?:boolean;forNotification?:boolean;now?:string}):BankAgendaItem[]{
  return items.filter(item=>{
    if(item.due_date?item.due_date<range.from||item.due_date>range.to:!range.includeUndated)return false;
    if(item.kind==="installment"&&(item.observed_installments??0)>=(item.total_installments??0))return false;
    if(range.forNotification){
      const age=Date.parse(range.now??new Date().toISOString())-Date.parse(item.synced_at);
      if(!Number.isFinite(age)||age<0||age>36*3600000||!item.due_date||item.kind==="installment")return false;
      if(item.kind==="recurring"&&(item.regularity_score??0)<0.8)return false;
    }
    return true;
  }).sort((a,b)=>(a.due_date??"9999").localeCompare(b.due_date??"9999")||a.id.localeCompare(b.id));
}
export function formatBankAgenda(items:BankAgendaItem[],incomplete=false):string {
  if(!items.length&&!incomplete)return "";
  const lines=items.slice(0,20).map(item=>{
    const name=`${item.mode==="business"?"Empresa · ":item.mode==="personal"?"Pessoal · ":""}${safe(item.institution_name)} · ${safe(item.resource_name)}`;
    const value=item.currency?bankMoney(item.amount,item.currency):`${item.amount??"Valor não informado"} (moeda não informada)`;
    if(item.kind==="bill")return `• ${name} · fatura com vencimento ${bankDate(item.due_date)} · ${value} · ${item.payment_evidence?`pagamentos informados no ciclo: ${bankMoney(item.payment_amount,item.currency)}; confira no banco`:"pagamento não confirmado"}`;
    if(item.kind==="installment")return `• ${name} · ${safe(item.description)} · ${value}/parcela · ${item.observed_installments}/${item.total_installments} parcelas observadas · próximo vencimento não informado`;
    return `• ${name} · ${safe(item.description)} · cobrança prevista em ${bankDate(item.due_date)} · estimativa ${value}`;
  });
  return `\n\n🏦 *Faturas e previsões dos bancos*\n${lines.join("\n")}${items.length>20?"\nVeja os demais itens em Contas.":""}${incomplete?"\nConsulta bancária incompleta: há dados em atualização ou indisponíveis.":""}\n_Faturas e previsões não foram somadas às compras realizadas ou às obrigações cadastradas. Confira pagamentos e datas no banco._`;
}
