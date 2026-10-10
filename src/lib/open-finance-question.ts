import "server-only";
import {getOpenFinanceAccess,type OpenFinanceScope} from "./open-finance-access";
import {openFinanceRpc} from "./open-finance-http";
import {bankDate,bankMoney,type BankOverview} from "./open-finance-display";
import {bankPeriod,type BankReport} from "./open-finance-report";
import type {User} from "./users";
type Identity=Pick<User,"id"|"email"|"plan"|"activeMode">;
type BankQuestion={kind:"spending"|"limits"|"balances"|"investments"|"bills";from:string;to:string};
const normalize=(value:string)=>value.normalize("NFD").replace(/\p{Diacritic}/gu,"").toLowerCase().trim();
const safeName=(value:string)=>value.replace(/[\r\n*`_~<>]/g," ").slice(0,200);
function monthPeriod(today:string,previous:boolean){const [year,month]=today.split("-").map(Number),start=new Date(Date.UTC(year,month-1-(previous?1:0),1)),end=new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+1,0));return {from:start.toISOString().slice(0,10),to:end.toISOString().slice(0,10)};}
/** Conservative read-only grammar. Unsupported filters fall through to the normal assistant. */
export function parseBankQuestion(question:string,today:string):BankQuestion|null {
  const text=normalize(question);
  if(text.length>500||/\b(registra|registre|lanca|lance|paga|pague|cancela|cancele|apaga|exclu|empresa|empresarial|pessoal|familia|ontem|hoje|semana|ano|com|ifood|categoria)\b/.test(text))return null;
  let kind:BankQuestion["kind"];
  if(/^(quanto (?:eu )?gastei|quanto gastamos)/.test(text)){
    if(!/^(?:quanto (?:eu )?gastei|quanto gastamos)(?: (?:nos|em todos os|em meus|nos meus) (?:cartoes|bancos|bancos conectados))?(?: (?:no )?(?:mes passado|mes anterior|este mes|nesse mes|neste mes))?[?!.]*$/.test(text))return null;
    kind="spending";
  }else if(/^(?:qual (?:e )?(?:o )?(?:meu )?limite(?: disponivel| total)?|quais (?:sao )?(?:os )?(?:meus )?limites|(?:me )?mostre os limites(?: dos cartoes)?)[?!.]*$/.test(text))kind="limits";
  else if(/^(?:como estao (?:os )?(?:meus )?investimentos|(?:me )?mostre (?:os )?(?:meus )?investimentos|quais (?:sao )?(?:os )?(?:meus )?investimentos)[?!.]*$/.test(text))kind="investments";
  else if(/^(?:quais (?:sao )?(?:as )?(?:minhas )?faturas|(?:me )?mostre (?:as )?(?:minhas )?faturas)[?!.]*$/.test(text))kind="bills";
  else if(/^(?:qual (?:e )?(?:o )?(?:meu )?saldo (?:nos bancos|nas contas bancarias)|(?:me )?mostre (?:os )?saldos (?:dos bancos|das contas bancarias))[?!.]*$/.test(text))kind="balances";
  else return null;
  return {kind,...monthPeriod(today,/mes (passado|anterior)/.test(text))};
}
async function spending(scope:OpenFinanceScope,period:{from:string;to:string}):Promise<string> {
  const report=await openFinanceRpc(scope,"zelo_of_report",{p_from:period.from,p_to:period.to,p_after:null}) as BankReport;
  const purchases=report.totals.filter(t=>t.kind==="card_purchases");
  const totals=purchases.length?purchases.map(t=>`${bankMoney(t.amount,t.currency)}${t.missing_amounts?` (${t.missing_amounts} compra(s) sem valor informado)`:""}`).join("\n"):"Nenhuma compra de cartão recebida nesse período. Isso não confirma ausência de gastos.";
  const account=report.totals.filter(t=>t.kind==="account_debits").map(t=>`${bankMoney(t.amount,t.currency)}${t.missing_amounts?` (${t.missing_amounts} débito(s) sem valor informado)`:""}`).join("\n");
  return `Bancos conectados (${scope.mode==="business"?"Empresa":"Pessoal"}) · ${bankDate(period.from)} a ${bankDate(period.to)}\nCompras nos cartões recebidas: ${totals}${account?`\nDébitos das contas a conferir: ${account}`:""}\nPagamentos de fatura, transferências e investimentos não foram somados às compras. Valores por moeda, sem conversão. Estes dados não são somados aos lançamentos manuais.\nO histórico recebido pode estar incompleto.${report.sync_pending?" Há uma importação pendente ou com falha.":""}${report.missing_dates?` ${report.missing_dates} movimentação(ões) sem data não entram no período.`:""}\nÚltima importação concluída: ${bankDate(report.last_successful_sync_at)}.`;
}
export async function savedBankSpending(user:Identity,mode:"personal"|"business",from:unknown,to:unknown):Promise<string|null>{
  const scope=await getOpenFinanceAccess(user,mode);if(!scope)return null;
  try{const period=bankPeriod(from,to),overview=await openFinanceRpc(scope,"zelo_of_overview",{p_environment:scope.environment})as BankOverview;if(!overview.connections.length)return null;return await spending(scope,period);}catch{return "Não consegui consultar o histórico bancário salvo agora. Tente novamente em Contas ou Financeiro.";}
}
export async function answerBankQuestion(user:Identity,mode:"personal"|"business",question:string,today:string):Promise<string|null> {
  const parsed=parseBankQuestion(question,today);if(!parsed)return null;
  const scope=await getOpenFinanceAccess(user,mode);if(!scope)return null;
  try{
    const overview=await openFinanceRpc(scope,"zelo_of_overview",{p_environment:scope.environment})as BankOverview;
    if(!overview.connections.length)return "Nenhum banco conectado neste modo. A conexão fica na aba Contas.";
    if(parsed.kind==="spending")return await spending(scope,parsed);
    const resources=overview.resources;
    const name=(id:string)=>{const r=resources.find(r=>r.id===id);return safeName(`${overview.connections.find(c=>c.id===r?.connection_id)?.institution_name||"Banco"} · ${r?.name||"Recurso"}`);};
    let lines:string[]=[];
    if(parsed.kind==="limits")lines=overview.limits.filter(l=>resources.some(r=>r.id===l.resource_id)).map(l=>`${name(l.resource_id)} · ${safeName(l.line_name||"Linha de crédito")}\nTotal: ${bankMoney(l.total_amount,l.currency)} · Utilizado: ${bankMoney(l.used_amount,l.currency)} · Disponível: ${bankMoney(l.available_amount,l.currency)}`);
    if(parsed.kind==="balances")lines=resources.filter(r=>r.resource_type==="account").map(r=>`${name(r.id)} · saldo disponível: ${bankMoney(r.available_amount,r.currency)}`);
    if(parsed.kind==="investments")lines=resources.filter(r=>r.resource_type==="investment").map(r=>`${name(r.id)} · bruto: ${bankMoney(r.gross_amount,r.currency)} · líquido: ${bankMoney(r.net_amount,r.currency)} · posição: ${bankDate(r.valuation_date)}`);
    if(parsed.kind==="bills")lines=overview.bills.filter(b=>resources.some(r=>r.id===b.resource_id)).map(b=>`${name(b.resource_id)} · vencimento ${bankDate(b.due_date)} · total: ${bankMoney(b.total_amount,b.currency)} · mínimo: ${bankMoney(b.minimum_payment_amount,b.currency)} · situação de pagamento: ${b.status==="unknown"?"não informada":safeName(b.status)}`);
    const selected=lines.slice(0,20);
    return `Dados bancários recebidos (${mode==="business"?"Empresa":"Pessoal"}):\n${selected.length?selected.join("\n\n"):"O banco ainda não informou esses dados."}\n\nValores não informados permanecem desconhecidos. Limites compartilhados não são somados. Atualização conforme o banco.${lines.length>20||overview.truncated?" Há mais registros; consulte Contas e Financeiro.":""}${overview.sync.some(s=>s.status!=="complete")?" Há uma importação pendente ou com falha.":""}`;
  }catch{return "Não consegui consultar os dados bancários salvos agora. Tente novamente em Contas ou Financeiro.";}
}
