import { bankDate, bankMoney, bankAmountWithoutCurrency } from "./open-finance-display";
import {bankInstallmentPosition,bankInstallmentProgress,groupBankAgenda,type BankAgenda} from "./open-finance-schedules";
import { bankAmountTotals } from "./bank-question-answer";
const safe = (text: string) => text.replace(/[\r\n*`_~<>]/g, " ").slice(0, 180);

/** An observed card charge is not proof that its bill was paid. */
export function formatBankSchedules(agenda: BankAgenda, kind: "installments" | "recurring", modeLabel: string): string {
  const items = agenda.items.filter(item => item.kind === (kind === "installments" ? "installment" : "recurring"));
  let result = `🏦 *${kind === "installments" ? "Parcelamentos" : "Recorrentes"} recebidos dos bancos · ${safe(modeLabel)}*`;
  if (!items.length) result += "\nNenhum dado correspondente recebido nesta consulta. Isso não confirma ausência de parcelas ou cobranças nos bancos.";
  const groups = new Map<string, typeof items>();
  for (const item of items) groups.set(item.institution_name, [...(groups.get(item.institution_name) ?? []), item]);
  for (const [name, rows] of groups) {
    result += `\n\n*${safe(name)}* · ${rows.length} compra(s)/cobrança(s) recebida(s)\n`;
    let shown=0;
    for(const group of groupBankAgenda(rows)){
      const selected=group.items.slice(0,10-shown);
      if(!selected.length)continue;
      shown+=selected.length;
      result+=`\n*${group.title}*\n\n`+selected.map(item=>{
        const value=item.currency?bankMoney(item.amount,item.currency):`${bankAmountWithoutCurrency(item.amount)} (moeda não informada)`;
        const progress=bankInstallmentProgress(item);
        const future=progress?progress.remaining?`${progress.remaining} parcela${progress.remaining===1?"":"s"} prevista${progress.remaining===1?"":"s"} após essa parcela`:"Sem novas parcelas previstas nesta sequência":"Quantidade restante não informada";
        const observations=kind==="installments"?`\n${bankInstallmentPosition(item)}\n${future}\nPagamento não confirmado`:"\nCobrança recorrente estimada pelo banco.";
        return `• ${safe(item.description)}\n💳 ${safe(item.resource_name)}\n💰 ${value}${kind==="installments"?" por parcela":""}${observations}\n📅 ${item.due_date?`Vencimento informado: ${bankDate(item.due_date)}`:"Vencimento não informado"}\nRecebido em ${bankDate(item.synced_at)}.`;
      }).join("\n\n");
      result+="\n";
    }
    if (kind === "installments") {
      const totals = bankAmountTotals(rows.map(item => ({ amount: item.amount, currency: item.currency })), agenda.incomplete);
      if (totals.length) result += `\nValor de uma parcela de cada compra recebida (inclui últimas parcelas identificadas; não é saldo devedor):\n${totals.join("\n")}`;
    }
    if (rows.length > 10) result += `\nMais ${rows.length - 10} item(ns); consulte Contas. Os subtotais incluem todos os itens recebidos.`;
  }
  if (agenda.incomplete) result += "\nConsulta bancária incompleta: há dados em atualização ou indisponíveis.";
  return result + (kind==="installments"?"\nAs parcelas identificadas não confirmam pagamento. A quantidade restante é uma previsão pelo último número recebido; datas futuras não são calculadas.":"") + "\nFaturas, parcelas e obrigações manuais não são somadas entre si nem aos gastos realizados.";
}
