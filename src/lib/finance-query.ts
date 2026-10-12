import {financeOrigin,ledgerBalance,ledgerExpenseGroups,type LedgerEntry} from "./finance-ledger";
import {bankDate,bankMoney} from "./open-finance-display";
import type {BankFinancialData} from "./open-finance-report";
import {merchantDescriptionMatchesTerms} from "./merchant-text";
export type FinanceQuery={from:string;to:string;type:"expense"|"income"|"result";source?:"card"|"account";category?:string;keywords?:string[];analysis?:boolean;detail?:boolean};
const normalize=(s:string)=>s.normalize("NFD").replace(/\p{Diacritic}/gu,"").toLowerCase();
const safe=(s:string)=>s.replace(/[\r\n*`_~<>]/g," ").slice(0,180);
const money=(value:number)=>bankMoney(value,"BRL");
export function summarizeFinanceQuery(entries:readonly LedgerEntry[],query:FinanceQuery,mode:"personal"|"business"):string {
  const scoped=entries.filter(e=>e.mode===mode&&e.status!=="pending"&&e.date>=query.from&&e.date<=query.to
    && (query.type==="result"||e.type===query.type)
    && (!query.source||e.bank?.resource_type===query.source)
    && (!query.category||normalize(e.category)===normalize(query.category))
    && (!query.keywords?.length||merchantDescriptionMatchesTerms(e.description,query.keywords)));
  const selected=scoped.filter(e=>e.included);
  const balance=ledgerBalance(selected),title=`${bankDate(query.from)} a ${bankDate(query.to)} · ${mode==="business"?"Empresa":"Pessoal"}`;
  let answer=query.type==="result"?`Resumo · ${title}\nEntradas: ${money(balance.income)}\nSaídas: ${money(balance.expense)}\nResultado do período: ${money(balance.balance)}. Esse resultado não é o saldo disponível no banco.`
    :`Você ${query.type==="income"?"recebeu":"gastou"} ${money(query.type==="income"?balance.income:balance.expense)} · ${title}${query.category?` · ${safe(query.category)}`:""}${query.source?` · ${query.source==="card"?"cartões":"contas bancárias"}`:""}.`;
  if(query.keywords?.length)answer+=`\nEstabelecimento/busca: ${safe(query.keywords[0])} · ${scoped.length} movimentação(ões) encontrada(s).`;
  const byOrigin=new Map<string,number>();
  for(const e of selected){const name=e.source==="bank"?(e.bank?.resource_type==="card"?"Cartões":"Contas bancárias"):e.source==="whatsapp"?"WhatsApp":"Plataforma";byOrigin.set(name,(byOrigin.get(name)??0)+Math.round(e.amount*100));}
  if(query.type!=="result"&&byOrigin.size)answer+=`\n${[...byOrigin].map(([name,cents])=>`${name}: ${money(cents/100)}`).join("\n")}`;
  if(query.analysis){
    const incomeGroups=new Map<string,number>();
    if(query.type==="income")for(const e of selected)incomeGroups.set(e.category,(incomeGroups.get(e.category)??0)+Math.round(e.amount*100));
    const groups=(query.type==="income"?[...incomeGroups].map(([name,cents])=>({name,value:cents/100})):ledgerExpenseGroups(selected,"category")).sort((a,b)=>b.value-a.value);
    answer+=`\n${query.type==="income"?"Receitas":"Gastos"} por categoria:\n${groups.slice(0,20).map(g=>`${safe(g.name)}: ${money(g.value)}`).join("\n")||`Nenhuma ${query.type==="income"?"receita":"despesa"} realizada no período.`}`;
  }
  if(query.detail||query.keywords?.length){answer+=`\nMovimentações:\n${scoped.slice(0,40).map(e=>`${bankDate(e.date)} · ${safe(e.description)} · ${e.bank&&!e.included?bankMoney(e.bank.amount,e.bank.currency):money(e.amount)} · ${safe(e.category)} · ${safe(financeOrigin(e))}${!e.included?" · Fora do total (transferência/pagamento, moeda diferente ou valor não informado)":""}`).join("\n")||"Nenhum movimento recebido no período."}`;if(scoped.length>40)answer+=`\nMostrando 40 de ${scoped.length}; consulte o extrato completo em Finanças.`;}
  if(selected.some(e=>e.possibleDuplicate))answer+="\nHá registros manuais que podem repetir movimentos bancários. Confira as marcações no extrato.";
  return answer;
}
export function financeCoverageNotice(bank:BankFinancialData|null,entries:readonly LedgerEntry[]):string {
  if(!bank)return "";
  let notice="\nDados bancários recebidos e registros da Zelo. O banco pode não ter enviado todo o histórico do período. Pagamentos de fatura, transferências identificadas e investimentos não entram nos gastos.";
  if(entries.some(e=>e.bank&&!e.included))notice+=" Valores desconhecidos, moedas diferentes de BRL e movimentos excluídos ficam fora do total; confira o extrato.";
  if(bank.report.sync_pending)notice+=" Há uma atualização bancária pendente ou com falha.";
  if(bank.report.missing_dates)notice+=" Há movimentos sem data que não entram no período.";
  return notice+` Última atualização concluída: ${bankDate(bank.report.last_successful_sync_at)}.`;
}
