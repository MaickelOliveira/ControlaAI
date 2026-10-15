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
  const balance=ledgerBalance(selected),period=`📅 ${bankDate(query.from)} a ${bankDate(query.to)}\n${mode==="business"?"🏢 Empresa":"👤 Pessoal"}`;
  let answer=query.type==="result"?`📊 *Resumo financeiro*\n\n${period}\n\n*Entradas: ${money(balance.income)}*\n*Saídas: ${money(balance.expense)}*\n*Resultado do período: ${money(balance.balance)}*\n\nEsse resultado não é o saldo disponível no banco.`
    :`${query.type==="income"?"💰":"💸"} *Você ${query.type==="income"?"recebeu":"gastou"} ${money(query.type==="income"?balance.income:balance.expense)}*\n\n${period}${query.category?`\n🏷️ ${safe(query.category)}`:""}${query.source?`\nOrigem: ${query.source==="card"?"cartões":"contas bancárias"}`:""}`;
  if(query.keywords?.length)answer+=`\n\n🔎 Estabelecimento/busca: ${safe(query.keywords[0])}`;
  const byOrigin=new Map<string,number>();
  for(const e of selected){const name=e.source==="bank"?(e.bank?.resource_type==="card"?"Cartões":"Contas bancárias"):e.source==="whatsapp"?"WhatsApp":"Plataforma";byOrigin.set(name,(byOrigin.get(name)??0)+Math.round(e.amount*100));}

  if(query.analysis){
    const incomeGroups=new Map<string,number>();
    if(query.type==="income")for(const e of selected)incomeGroups.set(e.category,(incomeGroups.get(e.category)??0)+Math.round(e.amount*100));
    const groups=(query.type==="income"?[...incomeGroups].map(([name,cents])=>({name,value:cents/100})):ledgerExpenseGroups(selected,"category")).sort((a,b)=>b.value-a.value);
    if(groups.length)answer=`🏆 *Maior categoria de ${query.type==="income"?"receitas":"gastos"}: ${safe(groups[0].name)}*\n*${money(groups[0].value)}*\n\n${answer}`;
    answer+=`\n\n*${query.type==="income"?"Receitas":"Gastos"} por categoria*\n${groups.slice(0,20).map(g=>`• ${safe(g.name)}: ${money(g.value)}`).join("\n")||`Nenhuma ${query.type==="income"?"receita":"despesa"} realizada no período.`}`;
  }
  if(query.type!=="result"&&byOrigin.size)answer+=`\n\n*Por origem*\n${[...byOrigin].map(([name,cents])=>`• ${name}: ${money(cents/100)}`).join("\n")}`;
  if(query.detail||query.keywords?.length){
    const lines=scoped.slice(0,40).map((e,index)=>`*${index+1}. ${safe(e.description)}*\n💰 ${e.bank&&!e.included?bankMoney(e.bank.amount,e.bank.currency):money(e.amount)}\n📅 ${bankDate(e.date)} · ${safe(financeOrigin(e))}\n🏷️ ${safe(e.category)}${e.source!=="bank"&&e.registeredByName?`\n👤 Registrado por ${safe(e.registeredByName)}`:""}${!e.included?"\n⚠️ Fora do total (transferência/pagamento, moeda diferente ou valor não informado)":""}`);
    answer+=`\n\n*Movimentações encontradas (${scoped.length})*\n\n${lines.join("\n\n")||"Nenhum movimento recebido no período."}`;
    if(scoped.length>40)answer+=`\n\nMostrando 40 de ${scoped.length}; consulte o extrato completo em Finanças.`;
  }
  if(selected.some(e=>e.possibleDuplicate))answer+="\nHá registros manuais que podem repetir movimentos bancários. Confira as marcações no extrato.";
  return answer;
}
export function financeCoverageNotice(bank:BankFinancialData|null,entries:readonly LedgerEntry[]):string {
  if(!bank)return "";
  const notes=["O histórico recebido pode estar incompleto.","Pagamentos de fatura identificados e investimentos ficam fora dos gastos. Transferências só ficam fora quando reconhecidas como tal."];
  if(entries.some(e=>e.bank&&!e.included&&e.bank.kind!=="excluded"&&e.categorySource!=="excluded"))notes.push("Valores desconhecidos ou em outras moedas ficam fora da soma em reais.");
  if(bank.report.sync_pending)notes.push("Há uma atualização bancária pendente ou com falha.");
  if(bank.report.missing_dates)notes.push("Movimentos sem data não entram no período.");
  return `\n\nℹ️ *Sobre os dados*\nAtualização bancária: ${bankDate(bank.report.last_successful_sync_at)}\n${notes.map(note=>`• ${note}`).join("\n")}`;
}
