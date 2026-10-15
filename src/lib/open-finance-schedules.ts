import { bankDate, bankMoney, bankAmountWithoutCurrency } from "./open-finance-display";
import {descriptionExpenseCategory} from "./expense-category";
export type BankAgendaItem={id:string;mode?:"personal"|"business";resource_id?:string;kind:"bill"|"recurring"|"installment";description:string;resource_name:string;institution_name:string;due_date:string|null;amount:string|null;currency:string|null;synced_at:string;payment_evidence?:boolean;payment_amount?:string|null;total_installments?:number|null;observed_installments?:number|null;regularity_score?:number|null;last_observed_month?:string|null;last_observed_installment?:number|null};
export type BankAgenda={items:BankAgendaItem[];incomplete:boolean};
function monthIndex(date:string):number|null {
  const match=/^(\d{4})-(0[1-9]|1[0-2])(?:-\d{2})?$/.exec(date);
  return match?Number(match[1])*12+Number(match[2])-1:null;
}
function activeSchedule(item:BankAgendaItem,from:string):boolean {
  if(item.kind==="recurring"){
    // Repeating orders and journeys are purchases, not a subscription contract.
    if(["Delivery","Alimentação","Transporte","Saúde","Vestuário"].includes(descriptionExpenseCategory(item.description)??""))return false;
    return !item.due_date||item.due_date>=from;
  }
  if(item.kind!=="installment")return true;
  const observedMonth=item.last_observed_month?monthIndex(item.last_observed_month):null;
  const selectedMonth=monthIndex(from),last=item.last_observed_installment,total=item.total_installments;
  if(observedMonth===null||selectedMonth===null||!Number.isInteger(last)||!Number.isInteger(total)||!last||!total||last<1||last>total)return true;
  return observedMonth+total-last>=selectedMonth;
}
/** Current account view excludes inferred subscriptions and completed old schedules. */
export function visibleBankSchedules(items:readonly BankAgendaItem[],today:string):BankAgendaItem[]{
  return items.filter(item=>item.kind!=="bill"&&activeSchedule(item,today));
}
export type BankInstallmentProgress={current:number;total:number;remaining:number;stage:"ongoing"|"last"};
/** Polp's paidInstallments is the last observed ordinal, not payment evidence. */
export function bankInstallmentProgress(item:BankAgendaItem):BankInstallmentProgress|null {
  const current=item.observed_installments,total=item.total_installments;
  if(item.kind!=="installment"||typeof current!=="number"||typeof total!=="number"||!Number.isInteger(current)||!Number.isInteger(total)||total<2||total>1000||current<1||current>total)return null;
  return {current,total,remaining:total-current,stage:current===total?"last":"ongoing"};
}
export function bankInstallmentPosition(item:BankAgendaItem):string {
  const progress=bankInstallmentProgress(item);
  if(progress)return `Última parcela identificada: ${progress.current} de ${progress.total}`;
  const observed=item.observed_installments,total=item.total_installments;
  const currentKnown=typeof observed==="number"&&Number.isInteger(observed)&&observed>=1&&observed<=1000;
  const totalKnown=typeof total==="number"&&Number.isInteger(total)&&total>=2&&total<=1000;
  if(currentKnown&&totalKnown)return "Contagem de parcelas inconsistente; quantidade restante não informada";
  if(currentKnown)return `Última parcela identificada: ${observed}; total não informado`;
  if(totalKnown)return `Total de parcelas: ${total}; última parcela não informada`;
  return "Número da parcela e total não informados";
}
export type BankAgendaGroup={key:"bills"|"ongoing"|"recurring"|"unknown"|"last";title:string;items:BankAgendaItem[]};
export function groupBankAgenda(items:BankAgendaItem[]):BankAgendaGroup[] {
  const groups:BankAgendaGroup[]=[
    {key:"bills",title:"Faturas recebidas",items:[]},
    {key:"ongoing",title:"Parcelamentos em andamento",items:[]},
    {key:"recurring",title:"Assinaturas recorrentes",items:[]},
    {key:"unknown",title:"Parcelamentos com dados incompletos",items:[]},
    {key:"last",title:"Última parcela identificada",items:[]},
  ];
  for(const item of items){
    const progress=bankInstallmentProgress(item);
    const key=item.kind==="bill"?"bills":item.kind==="recurring"?"recurring":progress?.stage??"unknown";
    groups.find(group=>group.key===key)!.items.push(item);
  }
  return groups.filter(group=>group.items.length);
}
const safe=(text:string)=>text.replace(/[\r\n*`_~<>]/g," ").slice(0,180);
export function collectBankAgenda(items:BankAgendaItem[],range:{from:string;to:string;includeUndated?:boolean;includeObservedInstallments?:boolean;forNotification?:boolean;now?:string}):BankAgendaItem[]{
  return items.filter(item=>{
    if(!activeSchedule(item,range.from))return false;
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
  let count=0;
  const groups=groupBankAgenda(items).map(group=>{
    const shown=group.items.slice(0,20-count);
    if(!shown.length)return "";
    const lines=shown.map(item=>{
    count++;
    const name=`${item.mode==="business"?"Empresa · ":item.mode==="personal"?"Pessoal · ":""}${safe(item.institution_name)} · ${safe(item.resource_name)}`;
    const value=item.currency?bankMoney(item.amount,item.currency):`${bankAmountWithoutCurrency(item.amount)} (moeda não informada)`;
    const heading=`*${count}. ${item.kind==="bill"?"Fatura":safe(item.description)}*\n🏦 ${name}\n`;
    if(item.kind==="bill")return `${heading}💰 ${value}\n📅 fatura com vencimento ${bankDate(item.due_date)}\n${item.payment_evidence?`pagamentos informados no ciclo: ${bankMoney(item.payment_amount,item.currency)}; confira no banco`:"pagamento não confirmado"}`;
    if(item.kind==="installment"){
      const progress=bankInstallmentProgress(item);
      const future=progress?progress.remaining?`${progress.remaining} parcela${progress.remaining===1?"":"s"} prevista${progress.remaining===1?"":"s"} após essa parcela`:"Sem novas parcelas previstas nesta sequência":"Quantidade restante não informada";
      const position=`${bankInstallmentPosition(item)}\n${future}`;
      const due=item.due_date?`📅 próximo vencimento: ${bankDate(item.due_date)}`:"📅 Data da próxima parcela não enviada pelo banco; confira a fatura do cartão";
      return `${heading}💰 ${value} por parcela\n${position}\n${due}\nPagamento não confirmado`;
    }
    return `${heading}💰 Estimativa ${value}\n📅 cobrança prevista em ${bankDate(item.due_date)}`;
    });
    return `*${group.title}*\n\n${lines.join("\n\n")}`;
  });
  return `\n\n🏦 *Faturas e previsões dos bancos*\n\n${groups.filter(Boolean).join("\n\n")}${items.some(item=>item.kind==="installment")?"\n\n_O banco informa a parcela mais recente identificada; isso não confirma quantas foram pagas._":""}${items.length>20?"\n\nVeja os demais itens em Contas.":""}${incomplete?"\n\nConsulta bancária incompleta: há dados em atualização ou indisponíveis.":""}\n\n_Faturas e previsões não foram somadas às compras realizadas ou às obrigações cadastradas. Confira pagamentos e datas no banco._`;
}

/** An observed installment without a due date is not an upcoming payment. */
export function formatUpcomingBankAgenda(items:BankAgendaItem[],today:string,incomplete=false):string {
  const dated=items.filter(item=>item.due_date!==null&&item.due_date>=today);
  const undatedInstallments=items.filter(item=>item.due_date===null&&item.kind==="installment").length;
  const otherUndated=items.filter(item=>item.due_date===null&&item.kind!=="installment").length;
  const notes=[
    undatedInstallments?`${undatedInstallments} parcelamento${undatedInstallments===1?"":"s"} sem data da próxima cobrança ${undatedInstallments===1?"foi deixado":"foram deixados"} fora desta previsão. Confira a fatura do cartão no banco.`:"",
    otherUndated?`${otherUndated} outro${otherUndated===1?" item":"s itens"} do banco sem data de vencimento ${otherUndated===1?"foi deixado":"foram deixados"} fora desta previsão.`:"",
  ].filter(Boolean);
  const result=formatBankAgenda(dated,incomplete);
  return `${result}${notes.length?`\n\n_${notes.join(" ")}_`:""}`;
}
