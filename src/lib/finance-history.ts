import {bankDate} from "./open-finance-display";
import type {BankFinancialData} from "./open-finance-report";

/** Missing historic rows are not proof of no spending. Stored history is
 * queryable regardless of the rolling window offered by a connected bank. */
export function missingHistoricalLedgerNotice(bank:BankFinancialData|null,recordCount:number,today:string):string|null {
  if(!bank?.overview.connections.length||recordCount!==0||!bank.report.to||bank.report.to>=`${today.slice(0,7)}-01`)return null;
  return `Nenhum lançamento recebido na Zelo de ${bankDate(bank.report.from)} a ${bankDate(bank.report.to)}. Isso não significa que você não gastou: o banco pode não ter disponibilizado esse histórico. Você pode importar o extrato ou a fatura desse período.`;
}
