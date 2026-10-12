import { bankDate, bankMoney, bankAmountWithoutCurrency } from "./open-finance-display";
export type BankAgendaItem={id:string;mode?:"personal"|"business";resource_id?:string;kind:"bill"|"recurring"|"installment";description:string;resource_name:string;institution_name:string;due_date:string|null;amount:string|null;currency:string|null;synced_at:string;payment_evidence?:boolean;payment_amount?:string|null;total_installments?:number|null;observed_installments?:number|null;regularity_score?:number|null};
export type BankAgenda={items:BankAgendaItem[];incomplete:boolean};
const safe=(text:string)=>text.replace(/[\r\n*`_~<>]/g," ").slice(0,180);
export function collectBankAgenda(items:BankAgendaItem[],range:{from:string;to:string;includeUndated?:boolean;includeObservedInstallments?:boolean;forNotification?:boolean;now?:string}):BankAgendaItem[]{
  return items.filter(item=>{
    if(item.due_date?item.due_date<range.from||item.due_date>range.to:!range.includeUndated)return false;
    if(!range.includeObservedInstallments&&item.kind==="installment"&&(item.observed_installments??0)>=(item.total_installments??0))return false;
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
  const lines=items.slice(0,20).map((item,index)=>{
    const name=`${item.mode==="business"?"Empresa · ":item.mode==="personal"?"Pessoal · ":""}${safe(item.institution_name)} · ${safe(item.resource_name)}`;
    const value=item.currency?bankMoney(item.amount,item.currency):`${bankAmountWithoutCurrency(item.amount)} (moeda não informada)`;
    const heading=`*${index+1}. ${item.kind==="bill"?"Fatura":safe(item.description)}*\n🏦 ${name}\n`;
    if(item.kind==="bill")return `${heading}💰 ${value}\n📅 fatura com vencimento ${bankDate(item.due_date)}\n${item.payment_evidence?`pagamentos informados no ciclo: ${bankMoney(item.payment_amount,item.currency)}; confira no banco`:"pagamento não confirmado"}`;
    if(item.kind==="installment")return `${heading}💰 ${value}/parcela\n${item.observed_installments}/${item.total_installments} parcelas observadas\n📅 próximo vencimento não informado`;
    return `${heading}💰 Estimativa ${value}\n📅 cobrança prevista em ${bankDate(item.due_date)}`;
  });
  return `\n\n🏦 *Faturas e previsões dos bancos*\n\n${lines.join("\n\n")}${items.length>20?"\n\nVeja os demais itens em Contas.":""}${incomplete?"\n\nConsulta bancária incompleta: há dados em atualização ou indisponíveis.":""}\n\n_Faturas e previsões não foram somadas às compras realizadas ou às obrigações cadastradas. Confira pagamentos e datas no banco._`;
}
