import "server-only";
import {getOpenFinanceAccess,type OpenFinanceScope} from "./open-finance-access";
import {openFinanceRpc} from "./open-finance-http";
import {bankDate,bankMoney,type BankOverview} from "./open-finance-display";
import {bankPeriod,type BankReport} from "./open-finance-report";
import type {User} from "./users";
import {readUnifiedFinances} from "./unified-finances";
import {summarizeFinanceQuery,financeCoverageNotice} from "./finance-query";
import {parseBankQuestion} from "./bank-question-parser";
import {formatBankQuestion,matchingBankNames} from "./bank-question-answer";
export {parseBankQuestion} from "./bank-question-parser";
type Identity=Pick<User,"id"|"email"|"plan"|"activeMode">&Partial<Pick<User,"status">>;
async function spending(scope:OpenFinanceScope,period:{from:string;to:string}):Promise<string> {
  const report=await openFinanceRpc(scope,"zelo_of_report",{p_from:period.from,p_to:period.to,p_after:null}) as BankReport;
  const purchases=report.totals.filter(t=>t.kind==="card_purchases");
  const totals=purchases.length?purchases.map(t=>`${bankMoney(t.amount,t.currency)}${t.missing_amounts?` (${t.missing_amounts} compra(s) sem valor informado)`:""}`).join("\n"):"Nenhuma compra de cartão recebida nesse período. Isso não confirma ausência de gastos.";
  const account=report.totals.filter(t=>t.kind==="account_debits").map(t=>`${bankMoney(t.amount,t.currency)}${t.missing_amounts?` (${t.missing_amounts} débito(s) sem valor informado)`:""}`).join("\n");
  return `Bancos conectados (${scope.mode==="business"?"Empresa":"Pessoal"}) · ${bankDate(period.from)} a ${bankDate(period.to)}\nCompras nos cartões recebidas: ${totals}${account?`\nDébitos das contas a conferir: ${account}`:""}\nPagamentos de fatura, transferências e investimentos não foram somados às compras. Valores por moeda, sem conversão. Estes dados não são somados aos lançamentos manuais.\nO histórico recebido pode estar incompleto.${report.sync_pending?" Há uma importação pendente ou com falha.":""}${report.missing_dates?` ${report.missing_dates} movimentação(ões) sem data não entram no período.`:""}\nÚltima atualização concluída: ${bankDate(report.last_successful_sync_at)}.`;
}
export async function savedBankSpending(user:Identity,mode:"personal"|"business",from:unknown,to:unknown):Promise<string|null>{
  const scope=await getOpenFinanceAccess(user,mode);if(!scope)return null;
  try{const period=bankPeriod(from,to),overview=await openFinanceRpc(scope,"zelo_of_overview",{p_environment:scope.environment})as BankOverview;if(!overview.connections.length)return null;return await spending(scope,period);}catch{return "Não consegui consultar o histórico bancário salvo agora. Tente novamente em Contas ou Financeiro.";}
}
export async function answerBankQuestion(user:Identity,mode:"personal"|"business",question:string,today:string):Promise<string|null> {
  const parsed=parseBankQuestion(question,today);if(!parsed)return null;
  const scope=await getOpenFinanceAccess(user,mode);if(!scope)return null;
  try{
    if(parsed.kind==="spending"){
      const {entries,bank}=await readUnifiedFinances(user,mode,parsed.from,parsed.to);
      if(parsed.bankName){
        const names=matchingBankNames(bank?.overview.connections.map(c=>c.institution_name)??[],parsed.bankName,!parsed.explicitBank);
        if(!names.length&&!parsed.explicitBank)return null;
        if(!names.length)return "Não encontrei esse banco no histórico recebido deste modo. Confira o banco e a empresa selecionada em Contas.";
        const selected=entries.filter(entry=>entry.source==="bank"&&names.includes(entry.bank?.institution_name??""));
        return `Banco: ${names.join(", ").replace(/[\r\n*`_~<>]/g," ")}\n`+summarizeFinanceQuery(selected,{from:parsed.from,to:parsed.to,type:"expense",source:parsed.source},mode)+financeCoverageNotice(bank,selected)+" Esta consulta por banco inclui apenas movimentos bancários recebidos; os lançamentos manuais ficam fora.";
      }
      return summarizeFinanceQuery(entries,{from:parsed.from,to:parsed.to,type:"expense",source:parsed.source},mode)+financeCoverageNotice(bank,entries);
    }
    const overview=await openFinanceRpc(scope,"zelo_of_overview",{p_environment:scope.environment})as BankOverview;
    return formatBankQuestion(overview,parsed,mode==="business"?`Empresa${scope.companyName?` · ${scope.companyName}`:""}`:"Pessoal");
  }catch{return "Não consegui consultar os dados bancários salvos agora. Tente novamente em Contas ou Financeiro.";}
}
