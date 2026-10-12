import "server-only";
import type {User} from "./users";
import type {AIResult} from "./ai-processor";
import {getOpenFinanceAccess,canEnrollOpenFinance,type OpenFinanceIdentity} from "./open-finance-access";
import {readUnifiedFinances} from "./unified-finances";
import {summarizeFinanceQuery,financeCoverageNotice,type FinanceQuery} from "./finance-query";
import {answerBankQuestion,parseBankQuestion} from "./open-finance-question";
import {isBankPositionQuestion} from "./bank-question-parser";
import {expandMerchantAliases,getPendingFinances} from "./finances";
import {getRecurringByUser} from "./recurring";
import {collectUpcomingFinanceItems} from "./upcoming-finances";
import {readBankAgenda} from "./financial-agenda";
import {formatBankAgenda} from "./open-finance-schedules";
import {bankDate,bankMoney} from "./open-finance-display";
const normalize=(s:string)=>s.normalize("NFD").replace(/\p{Diacritic}/gu,"").toLowerCase();

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
  if(!parsed)return positionQuestion?"Consigo consultar os dados atuais recebidos dos bancos, por modo e empresa. Exemplos: ‘quanto tenho de empréstimos em cada banco’, ‘qual meu limite disponível no cartão Nubank’ e ‘mostre meus financiamentos’. Informe o banco se quiser filtrar. Para uma fatura de outro mês, peça ‘envie a fatura do Nubank de setembro’. Não vou substituir esse pedido por um resumo de gastos.":null;
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
