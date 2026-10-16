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
import {readBankAgenda,readFinancialAgenda} from "./financial-agenda";
import {formatBankAgenda} from "./open-finance-schedules";
import {bankDate,bankMoney} from "./open-finance-display";
import {financeOrigin,ledgerBalance,ledgerExpenseGroups,type LedgerEntry} from "./finance-ledger";
import {isBankBillPaymentDescription} from "./bank-bill-payment";
import {todayStrBR} from "./date-br";
const normalize=(s:string)=>s.normalize("NFD").replace(/\p{Diacritic}/gu,"").toLowerCase();
const safeSummary=(s:string)=>s.replace(/[\r\n*`_~<>]/g," ").slice(0,120);
const shiftDay=(date:string,days:number)=>new Date(Date.parse(`${date}T12:00:00Z`)+days*86400000).toISOString().slice(0,10);
const realizedTotal=(entries:readonly LedgerEntry[],mode:"personal"|"business",type:"income"|"expense",from:string,to:string)=>
  entries.filter(entry=>entry.mode===mode&&entry.included&&entry.status!=="pending"&&entry.type===type&&entry.date>=from&&entry.date<=to)
    .reduce((cents,entry)=>cents+Math.round(entry.amount*100),0)/100;

export async function answerBankWhatsAppMessage(user:User,mode:"personal"|"business",phoneAccess:string,message:string,today:string):Promise<string|null>{
  if(process.env.OPEN_FINANCE_WHATSAPP_ENABLED!=="true")return null;
  const text=normalize(message);
  const business=/\b(empresa|empresarial|empresariais|pj)\b/.test(text),personal=/\b(pessoal|pessoais|pf)\b/.test(text);
  const plainWording=text.trim().replace(/[?!.]+$/g,"");
  if(/^(?:explique (?:a )?|qual (?:e )?a )diferenca entre (?:o )?(?:dinheiro em conta|saldo da conta) e (?:o )?(?:valor investido|investimento)$/.test(plainWording))
    return "Dinheiro em conta é o saldo que o banco informa como disponível; confira no extrato se esse saldo inclui crédito adicional. O valor de um investimento é a posição de uma aplicação, que pode variar e não equivale a dinheiro disponível para gastar; resgate, prazo e impostos dependem do produto. Esses valores não são somados como se fossem o mesmo saldo. Confira cada posição no banco.";
  if(/^(?:separe|mostre) (?:os )?investimentos? pesso(?:al|ais) (?:separados? )?(?:de|dos) (?:os )?investimentos? da empresa$/.test(plainWording)){
    if(phoneAccess!=="both")return "Este número precisa ter acesso aos modos Pessoal e Empresa para comparar as duas posições. Confira o acesso no painel da Zelo.";
    const [personalAnswer,businessAnswer]=await Promise.all([
      answerBankQuestion(user,"personal","Mostre meus investimentos",today),
      answerBankQuestion(user,"business","Mostre meus investimentos",today),
    ]);
    return `Investimentos separados por modo\n\nPessoal: ${personalAnswer??"consulta indisponível neste modo"}\n\nEmpresa: ${businessAnswer??"consulta indisponível para a empresa selecionada"}\nAs posições de Pessoal e Empresa não são somadas.`;
  }
  if(/^explique se saldo zero prova quitacao do emprestimo$/.test(plainWording))
    return "Saldo devedor informado como zero não prova quitação do empréstimo. O banco pode ter enviado uma posição parcial ou antiga, e o contrato pode continuar aberto por outras condições. Para confirmar o encerramento, consulte o contrato e a confirmação de quitação no banco.";
  const positionQuestion=isBankPositionQuestion(message);
  if(business&&personal&&positionQuestion)return "Escolha um modo por consulta: Pessoal ou Empresa. No modo Empresa, uso somente a empresa selecionada no seu WhatsApp.";
  const requested=business?"business":personal?"personal":mode;
  if(phoneAccess!=="both"&&phoneAccess!==requested)return positionQuestion||/banco|cartao|cartoes|finance|saldo|limite|venc|cobranc|previs|extrato|parcel|obrigac/.test(text)?"Este número não tem acesso a esse modo da Zelo.":null;
  const undatedDue=/\b(?:cobrancas?|parcelas?|contas?|obrigacoes?)\b/.test(text)&&/\b(?:sem data|nao (?:tem|possuem|temos) data|data nao informada)\b/.test(text);
  const dueToday=/\b(?:vence|vencem|vencimento|vencimentos) hoje\b/.test(text);
  const dueSeven=/\b(?:vence|vencem|vencimento|vencimentos)\b/.test(text)&&/\bproximos? (?:sete|7) dias\b/.test(text);
  const dueMonth=/\b(?:vence|vencem|vencimento|vencimentos)\b/.test(text)&&/\bate o fim do mes\b/.test(text);
  if(undatedDue||((dueToday||dueSeven||dueMonth)&&!/\bfaturas?\b|\bparcelas? do cartao\b/.test(text))){
    const to=undatedDue?shiftDay(today,365):dueToday?today:dueSeven?shiftDay(today,6)
      :new Date(Date.UTC(Number(today.slice(0,4)),Number(today.slice(5,7)),0)).toISOString().slice(0,10);
    const confirmedDate=/\bdata confirmada\b/.test(text);
    try{
      const agenda=await readFinancialAgenda(user,requested,{from:today,to,today,includeUndated:undatedDue,includeBank:true});
      const manual=agenda.commitments.filter(item=>item.mode===requested&&item.type==="expense"&&(undatedDue?!item.dueDate:Boolean(item.dueDate&&item.dueDate>=today&&item.dueDate<=to))&&(!confirmedDate||item.origin==="scheduled"));
      const bank=agenda.bank.items.filter(item=>!item.mode||item.mode===requested).filter(item=>undatedDue?!item.due_date:Boolean(item.due_date&&item.due_date>=today&&item.due_date<=to)).filter(item=>!confirmedDate||item.kind==="bill");
      const lines=[
        ...manual.map(item=>`• ${safeSummary(item.description)} · ${bankMoney(item.amount,"BRL")}${item.dueDate?` · ${bankDate(item.dueDate)}`:" · data não informada"} · ${item.origin==="scheduled"?"cadastrado na Zelo":"previsão cadastrada na Zelo"}`),
        ...bank.map(item=>`• ${safeSummary(item.kind==="bill"?"Fatura":item.description)} · ${safeSummary(item.institution_name)} · ${bankMoney(item.amount,item.currency)}${item.due_date?` · ${bankDate(item.due_date)}`:" · data não informada"} · ${item.kind==="recurring"?"data estimada a partir do histórico bancário":"pagamento não confirmado"}`),
      ];
      const title=undatedDue?"Cobranças recebidas sem data informada":dueToday?"Vencimentos de hoje com data informada":`Vencimentos de ${bankDate(today)} a ${bankDate(to)}`;
      const empty=undatedDue?"Não recebi cobranças sem data neste modo; isso não prova que não existam.":"Não recebi vencimentos com data neste período; isso não prova que não existam.";
      const note=undatedDue?"Sem uma data, não posso confirmar que essas cobranças vencerão no futuro nem que ainda não foram pagas.":"Datas estimadas pelo banco são previsões. O pagamento precisa ser conferido; valores de fontes diferentes podem representar a mesma cobrança.";
      return `${title} · ${requested==="personal"?"Pessoal":"Empresa"}\n${lines.slice(0,10).join("\n")||empty}${lines.length>10?`\nMais ${lines.length-10} item(ns) em Finanças e Contas.`:""}\n${note}${agenda.bank.incomplete?" Há dados incompletos do banco.":""}`;
    }catch{return "Não consegui conferir os vencimentos agora. Tente novamente em Finanças ou Contas; não vou afirmar que não há cobranças sem consultar os dados.";}
  }
  const paidForecast=/\bprevis(?:ao|oes)\b/.test(text)&&/\b(?:pagas?|pagos?|quitadas?|quitados?)\b/.test(text);
  const unconfirmedFuture=/\b(?:obrigacoes?|cobrancas?|faturas?|parcelas?) futuras?\b/.test(text)&&/\b(?:nao confirmadas?|sem confirmacao)\b/.test(text);
  if(paidForecast||unconfirmedFuture){
    const to=shiftDay(today,365);
    const from=paidForecast?`${today.slice(0,7)}-01`:today;
    try{
      if(!await getOpenFinanceAccess(user,requested,{throwOnStorageError:true}))return "Não tenho dados de um banco conectado neste modo para confirmar pagamentos. Confira Contas; não vou tratar ausência de dados como ausência de cobrança.";
      const agenda=await readBankAgenda(user,requested,{from,to,includeUndated:paidForecast,includeObservedInstallments:paidForecast});
      const items=agenda.items.filter(item=>(!item.mode||item.mode===requested)&&(paidForecast?item.payment_evidence===true:Boolean(item.due_date&&item.due_date>=today&&item.payment_evidence!==true)));
      const lines=items.slice(0,10).map(item=>`• ${safeSummary(item.description||"Fatura")} · ${safeSummary(item.institution_name)} · ${item.due_date?bankDate(item.due_date):"data não informada"} · ${bankMoney(item.amount,item.currency)} · ${paidForecast?`pagamento informado${item.payment_amount?` (${bankMoney(item.payment_amount,item.currency)})`:"; valor pago não informado"}`:item.kind==="recurring"?"previsão estimada; pagamento não confirmado":"pagamento não confirmado"}`);
      const title=paidForecast?"Previsões com pagamento informado pelo banco":"Obrigações futuras sem pagamento confirmado pelo banco";
      const empty=paidForecast?"O banco não informou pagamento dessas previsões no período consultado; isso não prova que não foram pagas.":"Não recebi obrigações futuras datadas sem confirmação de pagamento; isso não prova que não existam.";
      const caveat=paidForecast?"Um pagamento informado pode ser parcial; isso não confirma quitação total.":"Sem confirmação não significa dívida em aberto ou atraso. Itens sem data não foram classificados como futuros.";
      return `${title} · ${requested==="personal"?"Pessoal":"Empresa"} · ${bankDate(from)} a ${bankDate(to)}\n${lines.join("\n")||empty}${items.length>10?`\nMais ${items.length-10} item(ns) em Contas.`:""}\n${caveat}${agenda.incomplete?" Há dados incompletos do banco.":""}`;
    }catch{return "Não consegui conferir a confirmação de pagamentos agora. Consulte Contas ou o banco; não vou afirmar que uma cobrança foi paga ou ficou em aberto sem dados.";}
  }
  if(/\b(?:qual|quais) periodo\b/.test(text)&&/\bextrato\b/.test(text)&&/\bincompleto\b/.test(text)){
    try{
      const {bank}=await readUnifiedFinances(user,requested,`${today.slice(0,7)}-01`,today);
      if(!bank?.overview.connections.length)return "Não recebi um extrato bancário neste modo. Confira Contas e a conexão; não consigo identificar um período faltante.";
      const report=bank.report;
      const interval=`${bankDate(report.from)} a ${bankDate(report.to)}`;
      return `Extrato bancário consultado · ${requested==="personal"?"Pessoal":"Empresa"}\nPeríodo solicitado: ${interval}. O histórico recebido pode estar incompleto${report.sync_pending?"; há uma atualização pendente ou com falha":""}.${report.missing_dates?` O banco enviou ${report.missing_dates} movimento(s) sem data; eles não entram nesse período.`:""} Com esses dados, não consigo identificar os dias exatos que faltam nem afirmar que um dia sem lançamentos esteja completo. Última atualização recebida: ${bankDate(report.last_successful_sync_at)}.`;
    }catch{return "Não consegui conferir a cobertura do extrato agora. Tente novamente em Finanças; não vou inventar o período ausente.";}
  }
  if(/^quais parcelas (?:nao tem|estao sem) confirmacao de pagamento$/.test(plainWording)){
    const [year,month,day]=today.split("-").map(Number);
    const to=new Date(Date.UTC(year+1,month-1,day)).toISOString().slice(0,10);
    try{
      if(!await getOpenFinanceAccess(user,requested,{throwOnStorageError:true}))
        return "A consulta de parcelas bancárias não está disponível nesse modo. Confira Contas e a conexão; não vou informar zero sem dados do banco.";
      const agenda=await readBankAgenda(user,requested,{from:today,to,includeUndated:true});
      const unconfirmed=agenda.items.filter(item=>item.kind==="installment"&&item.payment_evidence!==true&&(!item.mode||item.mode===requested));
      const examples=unconfirmed.slice(0,5).map(item=>`• ${safeSummary(item.description)} · ${safeSummary(item.institution_name)} · ${bankMoney(item.amount,item.currency)} por parcela · próxima data: ${bankDate(item.due_date)}`);
      return `Parcelas dos bancos sem confirmação de pagamento · ${requested==="personal"?"Pessoal":"Empresa"}\n${unconfirmed.length} ${unconfirmed.length===1?"parcela recebida":"parcelas recebidas"} nos próximos 12 meses ou sem data informada.\n${examples.join("\n")||"Nenhuma parcela correspondente nos dados recebidos."}${unconfirmed.length>5?`\nMais ${unconfirmed.length-5} em Contas.`:""}\nA falta de confirmação não confirma que estão em aberto, atrasadas ou não pagas; confira a fatura no banco.${agenda.incomplete?" Há dados bancários incompletos.":""}`;
    }catch{return "Não consegui conferir as parcelas bancárias agora. Consulte Contas ou tente novamente; não vou afirmar que estejam em aberto sem confirmação do banco.";}
  }
  if(/^separe emprestimos de financiamentos$/.test(plainWording)){
    const [loans,financings]=await Promise.all([
      answerBankQuestion(user,requested,"Mostre meus empréstimos",today),
      answerBankQuestion(user,requested,"Mostre meus financiamentos",today),
    ]);
    return `Empréstimos e financiamentos separados · ${requested==="personal"?"Pessoal":"Empresa"}\n\nEmpréstimos: ${loans??"consulta indisponível"}\n\nFinanciamentos: ${financings??"consulta indisponível"}\nOs saldos recebidos não comprovam que os contratos estejam ativos ou quitados.`;
  }
  // A largest movement is a transaction query, even when "crédito" also resembles a credit-line position.
  // Leave it to the validated AI query plan instead of returning generic position guidance.
  if(/\b(?:maior|mais alto|mais alta)\b/.test(text)
    && /\b(?:credito|debito)\b/.test(text)
    && /\b(?:bancari[oa]|conta bancaria|extrato bancario)\b/.test(text))return null;
  const wording=text.trim().replace(/[?!.]+$/g,"");
  if(/^(?:mostre|liste|separe) estornos? de cartao separados? das receitas$/.test(wording)){
    const from=`${today.slice(0,7)}-01`;
    try{
      const {entries,bank}=await readUnifiedFinances(user,requested,from,today);
      if(!bank?.overview.connections.length)return "Não tenho dados de um banco conectado neste modo para identificar estornos. Confira Contas; não vou estimar valores.";
      const scoped=entries.filter(e=>e.mode===requested&&e.status!=="pending"&&e.date>=from&&e.date<=today);
      const cardCredits=scoped.filter(e=>e.source==="bank"&&e.bank?.resource_type==="card"&&e.bank.direction==="credit"&&!isBankBillPaymentDescription(e.description));
      const refunds=cardCredits.filter(e=>/^(?:refund|reversal)$/.test(normalize(e.bank?.classification??""))||/\b(?:estorno|reembolso|restituicao|refund|reversal|devolucao|compra cancelada)\b/.test(normalize(e.description)));
      const unclassified=cardCredits.length-refunds.length;
      const income=scoped.filter(e=>e.included&&e.type==="income");
      const incomeTotal=income.reduce((cents,e)=>cents+Math.round(e.amount*100),0)/100;
      const refundLines=refunds.slice(0,20).map(e=>`• ${bankDate(e.date)} · ${safeSummary(e.description)} · ${bankMoney(e.bank?.amount,e.bank?.currency)} · ${safeSummary(financeOrigin(e))}${e.included?" · Reduz despesas":" · Fora da soma em reais"}`).join("\n");
      return `Estornos de cartão identificados · ${bankDate(from)} a ${bankDate(today)} · ${requested==="personal"?"Pessoal":"Empresa"}\n${refundLines||"Nenhum estorno de cartão identificado nos dados recebidos deste mês; isso não confirma que não ocorreu."}${refunds.length>20?`\nMostrando 20 de ${refunds.length}; confira Finanças.`:""}\n\nReceitas realizadas sem estornos: ${bankMoney(incomeTotal,"BRL")} em ${income.length} lançamento(s). Estornos reduzem despesas e não entram nesse total.${unclassified?` Há ${unclassified} ${unclassified===1?"crédito":"créditos"} de cartão sem identificação de estorno; não os contei como devolução.`:""}${financeCoverageNotice(bank,entries)}`;
    }catch{return "Não consegui separar estornos de receitas agora. Confira Finanças ou tente novamente; nenhum valor foi estimado.";}
  }
  if(wording==="ha lancamentos com a mesma data e valor que precisam de conferencia"){
    const from=`${today.slice(0,7)}-01`;
    try{
      const {entries,bank}=await readUnifiedFinances(user,requested,from,today);
      const groups=new Map<string,LedgerEntry[]>();
      for(const entry of entries.filter(e=>e.mode===requested&&e.included&&e.status!=="pending"&&e.amount>0&&e.date>=from&&e.date<=today)){
        const key=`${entry.date}|${entry.type}|${Math.round(entry.amount*100)}`;
        groups.set(key,[...groups.get(key)??[],entry]);
      }
      const candidates=[...groups.values()].filter(group=>group.length>1).sort((a,b)=>b[0].date.localeCompare(a[0].date));
      const lines=candidates.slice(0,10).map((group,index)=>`${index+1}. ${bankDate(group[0].date)} · ${bankMoney(group[0].amount,"BRL")} · ${group[0].type==="income"?"entradas":"saídas"}\n${group.map(e=>`• ${safeSummary(e.description)} · ${safeSummary(financeOrigin(e))}`).join("\n")}`).join("\n\n");
      return `Coincidências de data, valor e sentido para conferir · ${bankDate(from)} a ${bankDate(today)}\n${lines||"Nenhuma coincidência encontrada nos movimentos realizados recebidos."}${candidates.length>10?`\nMostrando 10 de ${candidates.length} grupos; confira Finanças.`:""}\nA coincidência não prova duplicação; não removi nem alterei nenhum lançamento.${financeCoverageNotice(bank,entries)}`;
    }catch{return "Não consegui conferir possíveis repetições agora. Confira Finanças ou tente novamente; nenhum lançamento foi alterado.";}
  }
  const weeklyAccounts=/^quanto (?:entrou na conta|saiu das contas) nesta semana$/.test(wording);
  const splitSources=wording==="separe movimentacoes de conta e de cartao nos ultimos sete dias";
  const cardPurchases=wording==="mostre compras de cartao do mes sem pagamentos de fatura";
  const billPayments=wording==="encontre pagamentos de fatura do mes e diga se ficaram fora dos gastos";
  const ownTransfers=wording==="encontre transferencias entre minhas proprias contas no mes";
  const pixDirection=wording.match(/^quais pix (enviados|recebidos) aparecem no extrato deste mes$/)?.[1];
  const missingAmount=wording==="quais lancamentos do extrato nao tem valor informado";
  const missingDate=wording==="quais lancamentos nao tem data informada";
  if(weeklyAccounts||splitSources||cardPurchases||billPayments||ownTransfers||pixDirection||missingAmount||missingDate){
    const day=new Date(`${today}T00:00:00Z`);
    const from=weeklyAccounts?new Date(day.getTime()-((day.getUTCDay()+6)%7)*86400000).toISOString().slice(0,10)
      :splitSources?new Date(day.getTime()-6*86400000).toISOString().slice(0,10):`${today.slice(0,7)}-01`;
    try{
      const {entries,bank}=await readUnifiedFinances(user,requested,from,today);
      if(!bank?.overview.connections.length)return "Não tenho dados de um banco conectado neste modo para responder. Confira Contas; não vou estimar valores.";
      const scoped=entries.filter(e=>e.mode===requested&&e.source==="bank"&&e.status!=="pending"&&e.date>=from&&e.date<=today);
      const account=scoped.filter(e=>e.bank?.resource_type==="account"),card=scoped.filter(e=>e.bank?.resource_type==="card");
      const money=(value:number)=>bankMoney(value,"BRL");
      const lines=(rows:LedgerEntry[])=>rows.sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id)).slice(0,20).map(e=>{
        const value=bankMoney(e.bank?.amount,e.bank?.currency);
        const direction=e.bank?.direction==="credit"?"Entrada":"Saída";
        return `• ${bankDate(e.date)} · ${safeSummary(e.description)} · ${direction} ${value} · ${safeSummary(financeOrigin(e))}${e.included?"":" · Fora dos totais"}`;
      }).join("\n")||"Nenhum movimento recebido neste período.";
      const coverage=financeCoverageNotice(bank,entries);
      if(missingDate)return `${bank.report.missing_dates?`O banco informou ${bank.report.missing_dates} movimento(s) sem data no período consultado.`:"O banco não informou movimentos sem data neste período."} Não consigo listar seus nomes pelo extrato por data. Confira Contas e o banco; isso não confirma que o histórico esteja completo.${coverage}`;
      if(weeklyAccounts){
        const incoming=wording.includes("entrou"),selected=account.filter(e=>e.included&&e.type===(incoming?"income":"expense"));
        const total=selected.reduce((sum,e)=>sum+Math.round(e.amount*100),0)/100;
        return `${incoming?"Entradas":"Saídas"} das contas bancárias · ${bankDate(from)} a ${bankDate(today)}\n${money(total)} em ${selected.length} movimento(s) recebido(s). Compras de cartão e transferências próprias confirmadas não entram nesta soma.${coverage}`;
      }
      if(splitSources){
        const section=(label:string,rows:LedgerEntry[])=>{const balance=ledgerBalance(rows);return `${label} · ${rows.length} movimento(s) recebido(s)\nEntradas: ${money(balance.income)} · Saídas: ${money(balance.expense)}\n${lines(rows)}`;};
        return `Movimentações recebidas · ${bankDate(from)} a ${bankDate(today)}\n\n${section("Contas bancárias",account)}\n\n${section("Cartões",card)}\nTotais excluem transferências e pagamentos confirmados; esses movimentos seguem listados como fora dos totais.${coverage}`;
      }
      let label:string,selected:LedgerEntry[];
      if(cardPurchases){label="Compras de cartão";selected=card.filter(e=>e.bank?.direction==="debit"&&e.included&&!isBankBillPaymentDescription(e.description));}
      else if(billPayments){label="Pagamentos de fatura identificados no extrato";selected=scoped.filter(e=>isBankBillPaymentDescription(e.description));}
      else if(ownTransfers){label="Transferências entre contas próprias confirmadas";selected=account.filter(e=>normalize(e.category)==="transferencia entre contas proprias");}
      else if(pixDirection){label=`Pix ${pixDirection}`;selected=account.filter(e=>/\bpix\b/.test(normalize(e.description))&&e.bank?.direction===(pixDirection==="enviados"?"debit":"credit"));}
      else {label="Lançamentos com valor não informado";selected=scoped.filter(e=>bankMoney(e.bank?.amount,e.bank?.currency)==="Não informado");}
      const sum=cardPurchases?`\nTotal conhecido: ${money(selected.reduce((cents,e)=>cents+Math.round(e.amount*100),0)/100)}.`:"";
      const paymentNote=billPayments?"\nPagamentos marcados “Fora dos totais” não foram somados aos gastos. Entradas e saídas podem representar os dois lados da mesma fatura; não as some. Confira no banco se o pagamento foi concluído.":"";
      return `${label} · ${bankDate(from)} a ${bankDate(today)}\n${selected.length} movimento(s) recebido(s).${sum}\n${lines(selected)}${selected.length>20?`\nMostrando 20 de ${selected.length}; veja o restante em Finanças.`:""}${paymentNote}${coverage}`;
    }catch{return "Não consegui consultar esses movimentos agora. Confira Finanças ou tente novamente; nenhum valor foi estimado.";}
  }
  if(/^quais foram minhas cinco movimentacoes mais recentes\s*[?!.]*$/.test(text.trim())){
    const from=new Date(Date.parse(`${today}T00:00:00Z`)-364*86400000).toISOString().slice(0,10);
    try{
      const {entries,bank}=await readUnifiedFinances(user,requested,from,today);
      const latest=entries.filter(entry=>entry.mode===requested&&entry.status!=="pending"&&entry.date>=from&&entry.date<=today)
        .sort((a,b)=>b.date.localeCompare(a.date)||(b.createdAt??"").localeCompare(a.createdAt??"")||a.id.localeCompare(b.id)).slice(0,5);
      const lines=latest.map((entry,index)=>{
        const credit=entry.bank?entry.bank.direction==="credit":entry.type==="income";
        const money=entry.bank?bankMoney(entry.bank.amount,entry.bank.currency):bankMoney(Math.abs(entry.amount),"BRL");
        const excluded=entry.bank?.kind==="excluded"||entry.categorySource==="excluded"||normalize(entry.category)==="transferencia entre contas proprias";
        const note=entry.included?"":money==="Não informado"?" · Valor não recebido; fora dos totais":excluded?" · Não altera o resultado":" · Fora dos totais";
        return `${index+1}. ${bankDate(entry.date)} · ${safeSummary(entry.description)}\n${credit?"Entrada":"Saída"}: ${money} · ${safeSummary(financeOrigin(entry))}${note}`;
      });
      return `Cinco movimentações mais recentes recebidas · ${requested==="personal"?"Pessoal":"Empresa"}\n${lines.join("\n\n")||"Nenhuma movimentação recebida nos últimos 12 meses."}\nConsulta dos últimos 12 meses; o histórico bancário pode estar incompleto.${bank?.report.sync_pending?" Há uma importação pendente ou com falha.":""}`;
    }catch{return "Não consegui consultar as movimentações agora. Tente novamente ou confira Finanças; nenhum valor foi estimado.";}
  }
  if (/^(?:qual (?:e )?a diferenca|explique a diferenca) entre (?:o )?saldo disponivel(?: da conta)? e (?:o )?limite (?:do|de) cartao\s*[?!.]*$/.test(text.trim()))
    return "Saldo disponível é o valor que o banco informa como disponível na sua conta; confira as regras da conta para saber se inclui crédito adicional. Limite disponível do cartão é crédito para compras, que gera cobrança na fatura quando usado. Ele não é dinheiro na conta e não deve ser somado ao saldo disponível.";
  if(/\bopen\s*(finance|banking)\b/.test(text)||(/\b(conectar|conecto|sincronizar|vincular)\b/.test(text)&&/\b(banco|bancos|bancaria|bancarias)\b/.test(text))){
    if(!canEnrollOpenFinance(user,requested)&&!await getOpenFinanceAccess(user,requested))return null;
    return "O Open Finance está disponível para contas bancárias do Brasil. Na Zelo, abra Contas → Conectar banco no modo Pessoal (PF) ou Empresa (PJ). Você autoriza diretamente no banco; a Zelo não pede sua senha. Depois, as consultas usam os dados recebidos e salvos na Zelo.";
  }
  const dayCount=Number(text.match(/\bproximos? (\d{1,2}) dias\b/)?.[1]??0);
  const upcomingPeriod=/\bneste mes\b/.test(text)||dayCount>=1&&dayCount<=31;
  const upcomingCardBills=/\bfaturas?\b/.test(text)&&/\b(?:vencem|vencimento|abertas?)\b/.test(text)&&upcomingPeriod;
  const upcomingCardInstallments=/\bparcelas?\b/.test(text)&&/\bcartao\b/.test(text)&&/\bvencem\b/.test(text)&&dayCount>=1&&dayCount<=31;
  if(upcomingCardBills||upcomingCardInstallments){
    const monthEnd=new Date(Date.UTC(Number(today.slice(0,4)),Number(today.slice(5,7)),0)).toISOString().slice(0,10);
    const openThisMonth=upcomingCardBills&&/\babertas?\b/.test(text)&&/\bneste mes\b/.test(text);
    const from=/\bneste mes\b/.test(text)&&!openThisMonth?`${today.slice(0,7)}-01`:today;
    const to=/\bneste mes\b/.test(text)?monthEnd:new Date(Date.parse(`${today}T12:00:00Z`)+dayCount*86400000).toISOString().slice(0,10);
    try{
      const agenda=await readBankAgenda(user,requested,{from,to,includeUndated:false});
      const kind=upcomingCardBills?"bill":"installment";
      const items=agenda.items.filter(item=>item.kind===kind&&item.due_date&&item.due_date>=from&&item.due_date<=to);
      const name=upcomingCardBills?"faturas":"parcelas do cartão";
      if(!items.length)return `Não recebi ${name} com vencimento informado de ${bankDate(from)} a ${bankDate(to)}. Isso não confirma que não haja cobranças; confira Contas e o banco.${openThisMonth?" Não posso confirmar se faturas já vencidas continuam em aberto.":""}${agenda.incomplete?" A consulta bancária está incompleta.":""}`;
      const answer=formatBankAgenda(items,agenda.incomplete);
      return upcomingCardBills&&/\babertas?\b/.test(text)?`${answer}\nNão posso confirmar o total ainda em aberto: a situação de pagamento de cada fatura precisa ser conferida no banco.${openThisMonth?" Faturas com vencimento anterior a hoje não foram listadas como abertas sem confirmação do banco.":""}`:answer;
    }catch{return "Não consegui consultar as faturas e parcelas dos bancos agora. Confira Contas ou tente novamente; nenhum valor foi estimado.";}
  }
  // Let the typed AI plan resolve other due-date wording; the legacy parser can mistake the time phrase for a bank name.
  if (/\bfaturas?\b/.test(text) && /\bvenc(?:e|em|erao|eram)\b/.test(text)) return null;
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
  const messageMode=normalize(message);
  const explicitBusiness=/\b(?:empresa|empresarial|pj)\b/.test(messageMode),explicitPersonal=/\b(?:pessoal|pf)\b/.test(messageMode);
  if(explicitBusiness&&explicitPersonal)return "Escolha um modo por consulta: Pessoal ou Empresa.";
  const requested=message?explicitBusiness?"business":explicitPersonal?"personal":mode:ai.mode??mode;
  if(requested!=="personal"&&requested!=="business")return null;
  if(phoneAccess!=="both"&&requested!==mode)return "Este número não tem acesso a esse modo da Zelo.";
  if(ai.personName)return null;
  try{
    const scope=await getOpenFinanceAccess(user,requested,{throwOnStorageError:true});
    if(!scope)return null;
    const from=ai.period?.from??defaultPeriod[0],to=ai.period?.to??defaultPeriod[1];
    const text=normalize(message);
    const source:FinanceQuery["source"]=/\b(cartao|cartoes)\b/.test(text)?"card":/\b(contas bancarias|bancos conectados)\b/.test(text)?"account":undefined;
    const compares=/\bcompar(?:e|ar|acao)\b/.test(text);
    const compareWeek=compares&&/\b(?:esta|desta|nesta) semana\b/.test(text)&&/\bsemana (?:anterior|passada)\b/.test(text);
    const compareMonth=compares&&/\b(?:este|deste|neste) mes\b/.test(text)&&/\bmes (?:passado|anterior)\b/.test(text);
    if((compareWeek||compareMonth)&&!ai.account&&!ai.category&&!ai.keyword&&!source){
      const today=todayStrBR();
      const income=/\b(?:entradas?|receitas?|recebimentos?)\b/.test(text)&&!/\b(?:gastos?|despesas?|saidas?)\b/.test(text);
      const type: "income"|"expense"=income?"income":"expense";
      let currentFrom:string,previousFrom:string,previousTo:string,comparableTo:string;
      if(compareWeek){
        const weekday=(new Date(`${today}T12:00:00Z`).getUTCDay()+6)%7;
        currentFrom=shiftDay(today,-weekday);
        previousFrom=shiftDay(currentFrom,-7);
        previousTo=shiftDay(previousFrom,6);
        comparableTo=shiftDay(previousFrom,weekday);
      }else{
        currentFrom=`${today.slice(0,7)}-01`;
        const year=Number(today.slice(0,4)),month=Number(today.slice(5,7));
        previousFrom=new Date(Date.UTC(year,month-2,1)).toISOString().slice(0,10);
        previousTo=new Date(Date.UTC(year,month-1,0)).toISOString().slice(0,10);
        comparableTo=`${previousFrom.slice(0,8)}${String(Math.min(Number(today.slice(8)),Number(previousTo.slice(8)))).padStart(2,"0")}`;
      }
      const [current,previous]=await Promise.all([
        readUnifiedFinances(user,requested,currentFrom,today),
        readUnifiedFinances(user,requested,previousFrom,previousTo),
      ]);
      if(!current.bank?.overview.connections.length||!previous.bank?.overview.connections.length)return null;
      const currentTotal=realizedTotal(current.entries,requested,type,currentFrom,today);
      const comparableTotal=realizedTotal(previous.entries,requested,type,previousFrom,comparableTo);
      const previousTotal=realizedTotal(previous.entries,requested,type,previousFrom,previousTo);
      const difference=Math.round((currentTotal-comparableTotal)*100)/100;
      const label=type==="income"?"entradas":"saídas";
      return `Comparação de ${label} · ${requested==="personal"?"Pessoal":"Empresa"}\nPeríodo atual até hoje (${bankDate(currentFrom)} a ${bankDate(today)}): ${bankMoney(currentTotal,"BRL")}\nMesmo intervalo anterior (${bankDate(previousFrom)} a ${bankDate(comparableTo)}): ${bankMoney(comparableTotal,"BRL")}\nPeríodo anterior completo (${bankDate(previousFrom)} a ${bankDate(previousTo)}): ${bankMoney(previousTotal,"BRL")}\nDiferença entre intervalos comparáveis: ${bankMoney(Math.abs(difference),"BRL")} ${difference>0?"a mais":difference<0?"a menos":"de diferença"}. O período atual ainda está em andamento; totais representam os lançamentos recebidos.${financeCoverageNotice(current.bank,[...current.entries,...previous.entries])}`;
    }
    const {entries,bank}=await readUnifiedFinances(user,requested,from,to);
    if(!bank?.overview.connections.length)return null;
    if(ai.account)return "Para consultar uma conta específica, use o filtro em Finanças. Posso informar aqui o total de todos os bancos conectados neste modo ou o gasto por categoria e estabelecimento.";
    const topMatch=text.match(/\b(?:cinco|5)\s+(?:maiores|mais (?:altas|altos))\s+(despesas?|gastos?|saidas?|receitas?|entradas?)\b/);
    if(topMatch&&!ai.category&&!ai.keyword){
      const type: "income"|"expense"=/^(?:receita|entrada)/.test(topMatch[1])?"income":"expense";
      const selected=entries.filter(entry=>entry.mode===requested&&entry.included&&entry.status!=="pending"&&entry.type===type&&entry.amount>0&&entry.date>=from&&entry.date<=to&&(!source||entry.bank?.resource_type===source))
        .sort((a,b)=>b.amount-a.amount||b.date.localeCompare(a.date)||a.id.localeCompare(b.id)).slice(0,5);
      const lines=selected.map((entry,index)=>`${index+1}. ${safeSummary(entry.description)} · ${bankMoney(entry.amount,"BRL")} · ${bankDate(entry.date)} · ${safeSummary(entry.source==="bank"?entry.bank?.institution_name?.trim()||"Banco não informado":financeOrigin(entry))}`);
      return `Cinco maiores ${type==="income"?"receitas":"despesas"} realizadas · ${requested==="personal"?"Pessoal":"Empresa"} · ${bankDate(from)} a ${bankDate(to)}\n${lines.join("\n")||"Nenhum lançamento correspondente nos dados recebidos."}\nValores futuros e movimentos fora dos totais não entram nesta lista.${financeCoverageNotice(bank,entries)}`;
    }
    if(/\b(?:maior gasto|compra mais cara)\b/.test(text)){
      const largest=entries.filter(entry=>entry.mode===requested&&entry.included&&entry.status!=="pending"&&entry.type==="expense"&&entry.amount>0&&entry.date>=from&&entry.date<=to&&(!source||entry.bank?.resource_type===source))
        .sort((a,b)=>b.amount-a.amount)[0];
      return `${largest?`Maior gasto realizado · ${requested==="personal"?"Pessoal":"Empresa"}\n${safeSummary(largest.description)} · ${bankMoney(largest.amount,"BRL")}\nData: ${bankDate(largest.date)} · Categoria: ${safeSummary(largest.category)}`:`Não encontrei gasto realizado de ${bankDate(from)} a ${bankDate(to)} nesse modo.`}${financeCoverageNotice(bank,entries)}`;
    }
    if(/\b(?:recebi|receitas?|entradas?)\b/.test(text)&&/\bpor categoria\b|\bsepare\b[^.!?]*\bcategoria\b/.test(text)&&!/\b(?:despesas?|gastos?)\b/.test(text)){
      return summarizeFinanceQuery(entries,{from,to,type:"income",source,analysis:true,detail:false},requested)+financeCoverageNotice(bank,entries);
    }
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
    const generalResult=(/\bresultado financeiro\b/.test(text)||/\bresumo (?:de|do) (?:janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|mes passado)\b/.test(text))&&!source&&!ai.category&&!ai.keyword;
    const query:FinanceQuery={from,to,type:ai.intent==="balance_query"||generalResult?"result":ai.financeType==="income"?"income":"expense",source,category:ai.category,keywords:ai.keyword?expandMerchantAliases(ai.keyword):undefined,analysis:ai.intent==="finance_analysis",detail:ai.intent==="finance_detail",byBank:/\bpor banco\b|\bsepare\b[^.!?]*\bbancos?\b/.test(text)};
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
