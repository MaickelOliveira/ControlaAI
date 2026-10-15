import "server-only";
import type {User} from "./users";
import type {AIResult} from "./ai-processor";
import {getOpenFinanceAccess,canEnrollOpenFinance,type OpenFinanceIdentity} from "./open-finance-access";
import {readUnifiedFinances} from "./unified-finances";
import {summarizeFinanceQuery,financeCoverageNotice,type FinanceQuery} from "./finance-query";
import {answerBankQuestion,parseBankQuestion} from "./open-finance-question";
import {isBankPositionQuestion} from "./bank-question-parser";
import {BANK_QUERY_GUIDANCE} from "./bank-query-intent";
import {expandMerchantAliases,getPendingFinances} from "./finances";
import {getRecurringByUser} from "./recurring";
import {collectUpcomingFinanceItems} from "./upcoming-finances";
import {readBankAgenda} from "./financial-agenda";
import {formatBankAgenda} from "./open-finance-schedules";
import {bankDate,bankMoney} from "./open-finance-display";
import {ledgerExpenseGroups} from "./finance-ledger";
import {todayStrBR} from "./date-br";
const normalize=(s:string)=>s.normalize("NFD").replace(/\p{Diacritic}/gu,"").toLowerCase();
const safeSummary=(s:string)=>s.replace(/[\r\n*`_~<>]/g," ").slice(0,120);

export async function answerBankWhatsAppMessage(user:User,mode:"personal"|"business",phoneAccess:string,message:string,today:string):Promise<string|null>{
  if(process.env.OPEN_FINANCE_WHATSAPP_ENABLED!=="true")return null;
  const text=normalize(message);
  const business=/\b(empresa|empresarial|empresariais|pj)\b/.test(text),personal=/\b(pessoal|pessoais|pf)\b/.test(text);
  const positionQuestion=isBankPositionQuestion(message);
  if(business&&personal&&positionQuestion)return "Escolha um modo por consulta: Pessoal ou Empresa. No modo Empresa, uso somente a empresa selecionada no seu WhatsApp.";
  const requested=business?"business":personal?"personal":mode;
  if(phoneAccess!=="both"&&phoneAccess!==requested)return positionQuestion||/banco|cartao|cartoes|finance|saldo|limite/.test(text)?"Este número não tem acesso a esse modo da Zelo.":null;
  if(/\bopen\s*(finance|banking)\b/.test(text)||(/\b(conectar|conecto|sincronizar|vincular)\b/.test(text)&&/\b(banco|bancos|bancaria|bancarias)\b/.test(text))){
    if(!canEnrollOpenFinance(user,requested)&&!await getOpenFinanceAccess(user,requested))return null;
    return "O Open Finance está disponível para contas bancárias do Brasil. Na Zelo, abra Contas → Conectar banco no modo Pessoal (PF) ou Empresa (PJ). Você autoriza diretamente no banco; a Zelo não pede sua senha. Depois, as consultas usam os dados recebidos e salvos na Zelo.";
  }
  const question=message.replace(/\b(?:(?:da|na|de|em|do) (?:minha |meu |modo )?|modo )?(?:empresa|empresarial|empresariais|pessoal|pessoais|pf|pj)\b/gi,"").replace(/\s+/g," ").trim();
  const parsed=parseBankQuestion(question,today);
  if(parsed?.kind==="spending"&&!parsed.bankName)return null;
  // Historical positions cannot be resolved from the current DTO. Other wording reaches the model's typed bank query.
  if(!parsed)return positionQuestion&&/\b(mes|ontem|anterior|passad\w*|era|tinha|(?:19|20)\d{2})\b/.test(text)?`Consigo consultar os dados atuais recebidos dos bancos. ${BANK_QUERY_GUIDANCE}`:null;
  const reply=await answerBankQuestion(user,requested,question,today);
  return reply??(parsed.kind==="spending"?null:"A consulta bancária não está disponível nesse modo. Confira seu plano e a conexão em Contas; nenhum valor foi calculado.");
}

/** The model supplies filters only. Financial rows and totals never enter its prompt. */
export async function answerConnectedFinanceQuery(user:OpenFinanceIdentity,mode:"personal"|"business",phoneAccess:string,ai:AIResult,defaultPeriod:[string,string],message=""):Promise<string|null>{
  if(process.env.OPEN_FINANCE_WHATSAPP_ENABLED!=="true"||!["finance_query","balance_query","finance_detail","finance_analysis"].includes(ai.intent))return null;
  const requested=ai.mode??mode;
  if(requested!=="personal"&&requested!=="business")return null;
  if(phoneAccess!=="both"&&requested!==mode)return "Este número não tem acesso a esse modo da Zelo.";
  if(ai.personName)return null;
  try{
    const scope=await getOpenFinanceAccess(user,requested,{throwOnStorageError:true});
    if(!scope)return null;
    const from=ai.period?.from??defaultPeriod[0],to=ai.period?.to??defaultPeriod[1];
    const {entries,bank}=await readUnifiedFinances(user,requested,from,to);
    if(!bank?.overview.connections.length)return null;
    if(ai.account)return "Para consultar uma conta específica, use o filtro em Finanças. Posso informar aqui o total de todos os bancos conectados neste modo ou o gasto por categoria e estabelecimento.";
    const text=normalize(message);
    const source:FinanceQuery["source"]=/\b(cartao|cartoes)\b/.test(text)?"card":/\b(contas bancarias|bancos conectados)\b/.test(text)?"account":undefined;
    const monthlyOverview=/\bresumo\b/.test(text)&&/\b(mes|mensal|periodo)\b/.test(text)&&!ai.category&&!ai.keyword&&!source;
    if(monthlyOverview){
      const realized=entries.filter(entry=>entry.mode===requested&&entry.included&&entry.status!=="pending"&&entry.date>=from&&entry.date<=to);
      const categories=ledgerExpenseGroups(realized,"category").filter(group=>group.value>0).sort((a,b)=>b.value-a.value).slice(0,5);
      const largest=realized.filter(entry=>entry.type==="expense"&&entry.amount>0).sort((a,b)=>b.amount-a.amount).slice(0,3);
      const futureFrom=todayStrBR()>from?todayStrBR():from;
      let upcoming="Nenhum vencimento futuro com data informada neste período.";
      if(futureFrom<=to){
        const [pending,recurring,agenda]=await Promise.all([
          getPendingFinances(user.id,requested),getRecurringByUser(user.id,requested,"active"),
          readBankAgenda(user,requested,{from:futureFrom,to,includeUndated:false}),
        ]);
        const scheduled=collectUpcomingFinanceItems(pending,recurring,{from:futureFrom,to,mode:requested,includeUndated:false}).filter(item=>item.type==="expense"&&item.dueDate);
        const bankDue=agenda.items.filter(item=>item.due_date&&item.due_date>=futureFrom&&item.due_date<=to);
        const lines=[...scheduled.slice(0,5).map(item=>`${bankDate(item.dueDate)} · ${safeSummary(item.description)} · ${bankMoney(item.amount,"BRL")} (cadastrado na Zelo)`),
          ...bankDue.slice(0,5).map(item=>`${bankDate(item.due_date)} · ${safeSummary(item.kind==="bill"?"Fatura":item.description)} · ${bankMoney(item.amount,item.currency)} (${safeSummary(item.institution_name)}; ${item.payment_evidence?"há pagamento informado, confira o saldo":"pagamento não confirmado"})`)];
        if(lines.length)upcoming=lines.join("\n")+(scheduled.length>5||bankDue.length>5?"\nHá outros vencimentos em Finanças/Contas.":"");
        if(agenda.incomplete)upcoming+="\nAlguns dados bancários ainda estão incompletos.";
      }
      const summary=summarizeFinanceQuery(entries,{from,to,type:"result"},requested);
      return `${summary}\n\n*Principais categorias de despesas*\n${categories.map(group=>`• ${safeSummary(group.name)}: ${bankMoney(group.value,"BRL")}`).join("\n")||"Nenhuma despesa realizada no período."}\n\n*Maiores gastos realizados*\n${largest.map(item=>`• ${safeSummary(item.description)}: ${bankMoney(item.amount,"BRL")} (${bankDate(item.date)})`).join("\n")||"Nenhum gasto realizado no período."}\n\n*Próximos vencimentos com data informada*\n${upcoming}\n\nVencimentos previstos não entram no resultado já realizado. Valores do banco podem repetir obrigações cadastradas; confira se foram pagos.${financeCoverageNotice(bank,entries)}`;
    }
    const query:FinanceQuery={from,to,type:ai.intent==="balance_query"?"result":ai.financeType==="income"?"income":"expense",source,category:ai.category,keywords:ai.keyword?expandMerchantAliases(ai.keyword):undefined,analysis:ai.intent==="finance_analysis",detail:ai.intent==="finance_detail"};
    let answer=summarizeFinanceQuery(entries,query,requested)+financeCoverageNotice(bank,entries);
    if(ai.intent==="finance_detail"&&!query.source){
      const [pending,recurring]=await Promise.all([getPendingFinances(user.id,requested),getRecurringByUser(user.id,requested,"active")]);
      const categoryMatches=(e:{category:string})=>!query.category||normalize(e.category)===normalize(query.category);
      const upcoming=collectUpcomingFinanceItems(pending.filter(categoryMatches),recurring.filter(categoryMatches),{from,to,mode:requested,includeUndated:true}).filter(e=>e.type===query.type&&(!query.keywords?.length||query.keywords.some(k=>normalize(e.description).includes(normalize(k)))));
      if(upcoming.length)answer+=`\n\nValores ainda a ${query.type==="income"?"receber":"pagar"} (fora do total realizado):\n${upcoming.slice(0,20).map(e=>`${bankDate(e.dueDate)} · ${e.description.replace(/[\r\n*`_~<>]/g," ").slice(0,160)} · ${bankMoney(e.amount,"BRL")}`).join("\n")}${upcoming.length>20?"\nConsulte as demais pendências em Finanças.":""}`;
    }
    if(ai.intent==="finance_detail"&&query.type==="expense"&&!query.category&&query.source!=="account"){
      const agenda=await readBankAgenda(user,requested,{from,to,includeUndated:true});
      const items=agenda.items.filter(item=>!query.keywords?.length||query.keywords.some(k=>normalize(`${item.description} ${item.institution_name} ${item.resource_name}`).includes(normalize(k))));
      answer+=formatBankAgenda(items,agenda.incomplete);
    }
    return answer;
  }catch{return "Não consegui consultar o extrato completo agora. Tente novamente em Finanças; não vou apresentar um total parcial como se fosse completo.";}
}
