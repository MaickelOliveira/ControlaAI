import "server-only";
import {explicitFinanceCalendarPeriod} from "./ai-processor";
import {matchingBankNames,bankAmountTotals} from "./bank-question-answer";
import {normalizeBankText} from "./bank-question-parser";
import {monthRange} from "./calendar-range";
import {bankScheduleInExpensePeriod} from "./finance-expense-plan";
import {createFinanceLedger} from "./finance-ledger";
import {readBankInstallmentAnchors,readBankLedger} from "./finance-ledger-storage";
import {financePeriodExpenses} from "./finance-period-expenses";
import {getFinancesInRangeStrict,type FinanceMode} from "./finances";
import {getOpenFinanceAccess,type OpenFinanceIdentity} from "./open-finance-access";
import {bankDate,bankMoney} from "./open-finance-display";
import {bankPeriod} from "./open-finance-report";
import {bankInstallmentPosition,visibleBankSchedules,type BankAgendaItem} from "./open-finance-schedules";
import {linkBankInstallmentAnchors} from "./bank-installment-projections";
import {getRecurringByUser} from "./recurring";

const safe=(value:string)=>value.replace(/[\r\n*`_~<>]/g," ").slice(0,120);
const money=(value:number)=>bankMoney(value,"BRL");
const dateRange=(from:string,to:string)=>from===to?bankDate(from):`${bankDate(from)} a ${bankDate(to)}`;
const isPurchase=(description:string)=>!/\b(?:anuidade|anualidade|annual fee)\b/.test(normalizeBankText(description));
type Period={from:string;to:string};

export function parseCardInstallmentsQuestion(message:string,today:string){
 const text=normalizeBankText(message).replace(/\bcartos\b/g,"cartoes").replace(/[?!.,;:]+$/,"");
 const subject=/\b(?:compras? parceladas?|parcelamentos?|parcelad[oa]s?|parcelas?)\b/.test(text);
 const query=/\b(?:quais?|quant[oa]s?|o que|liste|listar|mostre|mostra|mostrar|consulte|ver|tenho|tem)\b/.test(text);
 if(!subject||!query||!/\bcart(?:ao|oes)\b|\b(?:o que|quanto) (?:eu )?(?:tenho|tem) parcelado (?:so )?(?:no|na)\b/.test(text))return null;
 if(/\b(?:como|onde|por que|gastei|paguei|parcelei|pagas|pago|faltam|restam|primeira|ultim[oa]s?|proxima parcela|cada cartao|anuidades?|assinaturas?|dupli\w*|repetid\w*|mesma compra|emprestimos?|financiamentos?|terminam|termina|encerr\w*|cadastr\w*|registr\w*|anot\w*|adicion\w*|alter\w*|exclu\w*|apag\w*|cancel\w*)\b/.test(text))return null;
 // Read the original text to keep slashes in explicit dates.
 const anchor=new Date(`${today}T12:00:00`);
 const period=explicitFinanceCalendarPeriod(message,anchor,!/\b(?:comprei|compras feitas)\b/.test(text))
  ?? (/\bquanto\b/.test(text)?monthRange(0,anchor):null);
 const last4=text.match(/\b(?:final|terminado em)\s+(\d{4})\b/)?.[1];
 const afterCard=/\bcartao\b/.test(text)?text.match(/\bcartao\s+(.+)$/)?.[1]??"":undefined;
 const afterInstallment=text.match(/\b(?:parcelad[oa]s?|parcelamentos?|parcelas?)\s+(?:so\s+)?(?:no|na|do|da)\s+(.+)$/)?.[1];
 const target=(afterCard??afterInstallment??"")
  .replace(/^(?:de credito\b\s*|(?:do|da|de|banco)\s+)*/,"")
  .split(/\s*(?:\b(?:final|terminado em|mes|proximo|este|esse|neste|nesse|hoje|amanha|ontem|na semana|pessoal|empresa|por favor|e quanto|quais|o que|tenho)\b|\b(?:em|no|de)\s+(?:janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|\d)\b)/)[0]
  .replace(/\s+(?:do|da|no|na|em|de)\s*$/,"").replace(/[,;:]+$/,"").trim();
 const mode:FinanceMode|undefined=/\b(?:empresa|empresarial|pj)\b/.test(text)?"business":/\b(?:pessoal|pf)\b/.test(text)?"personal":undefined;
 return {period,last4,target,mode,compareModes:/\b(?:empresa|empresarial|pj)\b/.test(text)&&/\b(?:pessoal|pf)\b/.test(text)};
}

async function readPlanning(user:OpenFinanceIdentity,mode:FinanceMode,period:Period,cardOnly=false){
 const bankEnabled=process.env.OPEN_FINANCE_WHATSAPP_ENABLED==="true";
 const scope=bankEnabled?await getOpenFinanceAccess(user,mode,{throwOnStorageError:true}):null;
 const [records,recurring,bank,installmentAnchors]=await Promise.all([
  cardOnly?[]:getFinancesInRangeStrict(user.id,mode,period.from,period.to),
  cardOnly?[]:getRecurringByUser(user.id,mode,"active",true),
  scope?readBankLedger(scope,period):null,
  scope?readBankInstallmentAnchors(scope):undefined,
 ]);
 const finances=createFinanceLedger(records,bank?.report.movements??[],mode);
 const label=mode==="personal"?"Pessoal":`Empresa${scope?.companyName?` · ${safe(scope.companyName)}`:""}`;
 const incomplete=!!(bank?.report.sync_pending||bank?.overview.truncated||bank?.overview.agenda?.incomplete||installmentAnchors?.incomplete);
 return {ledger:{finances,bank,installmentAnchors},recurring,label,incomplete,bankEnabled};
}

export async function answerFinancePlanning(user:OpenFinanceIdentity,mode:FinanceMode,from:string,to:string,today:string){
 let period:Period;
 try{period=bankPeriod(from,to);}catch{return "Escolha um período válido de até 366 dias para conferir suas despesas.";}
 try{
  const {ledger,recurring,label,incomplete,bankEnabled}=await readPlanning(user,mode,period);
  const {expensePlan}=financePeriodExpenses(ledger,recurring,{...period,type:"expense",categories:[],search:""},today);
  const {forecast,recorded,total,groups,unquantified}=expensePlan;
  const partial=incomplete||unquantified>0||!bankEnabled;
  const lines=[
   `*Despesas do período* · ${label} · ${dateRange(from,to)}`,
   forecast||!partial?`*A pagar (previsto): ${money(forecast)}*`:"*A pagar: previsão indisponível com os dados recebidos.*",
   `Registradas: ${money(recorded)}`,
   `${partial?"Total com os valores disponíveis":"Total de despesas"}: *${money(total)}*`,
   ...groups.map(group=>`• ${safe(group.name)}: ${money(group.value)}${group.forecast&&group.forecast!==group.value?` (${money(group.forecast)} previstos)`:""}`),
  ];
  if(unquantified)lines.push(`${unquantified} previsão(ões) fora da soma em reais por valor, moeda ou período a conferir.`);
  if(incomplete)lines.push("A atualização dos bancos está incompleta. O total pode mudar.");
  if(!bankEnabled)lines.push("A consulta bancária pelo WhatsApp está indisponível. Os valores acima vêm dos registros da Zelo.");
  if(from.slice(0,7)!==to.slice(0,7)||!from.endsWith("-01")||monthRange(0,new Date(`${from}T12:00:00`)).to!==to){
   lines.push("Para incluir parcelas de cartão com previsão apenas por mês, consulte o mês inteiro.");
  }
  return lines.join("\n");
 }catch{return "Não consegui conferir o extrato completo agora. Tente novamente ou veja a previsão em Finanças.";}
}

export async function answerCardInstallments(user:OpenFinanceIdentity,mode:FinanceMode,question:NonNullable<ReturnType<typeof parseCardInstallmentsQuestion>>,today:string){
 if(process.env.OPEN_FINANCE_WHATSAPP_ENABLED!=="true")return "As consultas bancárias pelo WhatsApp estão indisponíveis. Confira Contas no painel.";
 const {from,to}=question.period??monthRange(0,new Date(`${today}T12:00:00`));
 let period:Period;
 try{period=bankPeriod(from,to);}catch{return "Escolha um período válido de até 366 dias para conferir as parcelas.";}
 try{
  const {ledger,label,incomplete}=await readPlanning(user,mode,period,true);
  const overview=ledger.bank?.overview;
  if(!overview)return "A consulta bancária não está disponível neste modo. Confira Contas no painel.";
  const cards=overview.resources.filter(card=>card.resource_type==="card"&&(!question.last4||card.identification_last4===question.last4));
  const bankName=(id:string)=>overview.connections.find(connection=>connection.id===id)?.institution_name??"";
  const bankNames=question.target?matchingBankNames(cards.map(card=>bankName(card.connection_id)),question.target):[];
  const selected=cards.filter(card=>!question.target||bankNames.includes(bankName(card.connection_id))
   || ` ${normalizeBankText(`${bankName(card.connection_id)} ${card.name}`)} `.includes(` ${question.target} `)
   || ` ${normalizeBankText(card.name)} `.includes(` ${question.target} `));
  const coverage=incomplete?"\nHá dados bancários em atualização ou indisponíveis.":"";
  if(!selected.length)return `Não encontrei ${question.target||question.last4?"esse cartão":"cartões"} nos dados recebidos de ${label}.${coverage}`;
  const cardLabel=(card:typeof cards[number])=>`${safe(bankName(card.connection_id))} · ${safe(card.name)}${card.identification_last4?` · final ${card.identification_last4}`:""}`;
  if(selected.length>1&&(question.last4||question.target&&!bankNames.length))return `Encontrei mais de um cartão. Diga o banco e os quatro últimos dígitos.\n${selected.slice(0,12).map(card=>`• ${cardLabel(card)}`).join("\n")}`;
  const ids=new Set(selected.map(card=>card.id));
  const schedules=(items:readonly BankAgendaItem[])=>items.filter(item=>item.kind==="installment"&&!item.payment_evidence&&isPurchase(item.description)&&!!item.resource_id&&ids.has(item.resource_id));
  const cardData=financePeriodExpenses(ledger,[],{...period,type:"expense",categories:[],search:""},today);
  const allSchedules=overview.agenda?.items??[];
  const anchors=linkBankInstallmentAnchors(ledger.installmentAnchors?.items??[],allSchedules);
  const linked=new Set(anchors.flatMap(item=>[item.id,...item.source_schedule_ids??[]]));
  const entries=question.period?[
   ...cardData.postedFinances.flatMap(({bank,description,included})=>bank?.resource_type==="card"&&bank.resource_id&&ids.has(bank.resource_id)&&bank.direction==="debit"&&included&&(bank.installment_count??0)>1&&isPurchase(description)?
    [{card:bank.resource_id,name:description,amount:bank.amount,currency:bank.currency,detail:`${bank.installment_number??"?"}/${bank.installment_count} · registrada`}]:[]),
   ...cardData.projectedInstallments.filter(item=>ids.has(item.resource_id)&&isPurchase(item.description))
    .map(item=>({card:item.resource_id,name:item.description,amount:item.amount,currency:item.currency,detail:`${item.position}/${item.total} · ${item.month.slice(5)}/${item.month.slice(0,4)} · prevista`})),
   ...schedules(cardData.bankSchedules).filter(item=>bankScheduleInExpensePeriod(item,from,to))
    .map(item=>({card:item.resource_id,name:item.description,amount:item.amount,currency:item.currency,detail:item.due_date?`prevista para ${bankDate(item.due_date)}`:"prevista no mês · dia não informado"})),
  ]:[
   ...schedules(visibleBankSchedules(allSchedules,today)).filter(item=>!linked.has(item.id)&&!item.source_schedule_ids?.some(id=>linked.has(id)))
    .map(item=>({card:item.resource_id,name:item.description,amount:item.amount??null,currency:item.currency??selected.find(card=>card.id===item.resource_id)?.currency,detail:bankInstallmentPosition(item)})),
   ...anchors.filter(item=>{
    const index=(value:string)=>Number(value.slice(0,4))*12+Number(value.slice(5,7));
    return ids.has(item.resource_id)&&isPurchase(item.description)&&index(item.bill_month)+item.total_installments-item.observed_installments>=index(today);
   }).map(item=>({card:item.resource_id,name:item.description,amount:item.amount,currency:item.currency??selected.find(card=>card.id===item.resource_id)?.currency,detail:`Última parcela identificada: ${item.observed_installments} de ${item.total_installments}`})),
  ];
  const unknownInPeriod=!!question.period&&schedules(cardData.bankSchedules).some(item=>!bankScheduleInExpensePeriod(item,from,to));
  const totals=question.period?bankAmountTotals(entries,incomplete||unknownInPeriod):[];
  const byCard=new Map<string,typeof entries>();
  for(const entry of entries){
   if(!entry.card)continue;
   const items=byCard.get(entry.card)??[];
   items.push(entry);
   byCard.set(entry.card,items);
  }
  // shortcut: keep unusually long lists within the WhatsApp message limit, use Finanças for the rest.
  let shown=0;
  const lines=selected.flatMap(card=>{
   const items=(byCard.get(card.id)??[]).slice(0,Math.max(0,75-shown));
   shown+=items.length;
   return items.length?[`*${cardLabel(card)}*`,...items.map(item=>`• ${safe(item.name)} · ${bankMoney(item.amount,item.currency)} · ${item.detail}`)]:[];
  });
  if(entries.length>shown)lines.push(`Veja mais ${entries.length-shown} parcela(s) em Finanças.`);
  const title=`*Compras parceladas* · ${label}${question.period?` · ${dateRange(from,to)}`:""}`;
  const warning=unknownInPeriod?"\nHá parcelas sem mês ou dia suficiente para confirmar se entram nesse período.":"";
  const status=!question.period&&entries.length?"\nOs valores são por parcela. A última identificada pelo banco pode ainda estar em aberto.":"";
  return `${[title,...totals,...(lines.length?lines:["Nenhuma parcela encontrada para os cartões e o período consultados."])].join("\n")}${status}${warning}${coverage}`;
 }catch{return "Não consegui consultar as compras parceladas agora. Tente novamente ou confira o cartão em Contas.";}
}
