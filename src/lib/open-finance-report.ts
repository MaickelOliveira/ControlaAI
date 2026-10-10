import type { BankOverview } from "./open-finance-display";
export type BankTotal = {kind:"card_purchases"|"account_debits"|"credits"|"excluded"|"other";currency:string|null;amount:string|null;count:number;missing_amounts:number};
export type BankMovement = {id:string;resource_name:string;institution_name:string;resource_type:string;date:string;description:string;amount:string|null;currency:string|null;direction:string;classification:string;kind:BankTotal["kind"];bill_month:string|null;installment_number:number|null;installment_count:number|null};
export type BankReport = {from:string;to:string;history_complete:false;totals:BankTotal[];movements:BankMovement[];next:string|null;missing_dates:number;sync_pending:boolean;last_successful_sync_at:string|null};
export type BankFinancialData = {report:BankReport;overview:BankOverview};
export const BANK_TOTAL_LABELS:Record<BankTotal["kind"],string>={card_purchases:"Compras nos cartões",account_debits:"Débitos das contas a conferir",credits:"Créditos recebidos",excluded:"Transferências, pagamentos de fatura e investimentos",other:"Outras movimentações a conferir"};
export const BANK_HISTORY_NOTICE="Totais dos dados recebidos. O banco pode não fornecer todo o histórico do período. Pagamentos de fatura, transferências e investimentos não entram nas compras dos cartões. Débitos das contas podem repetir compras já registradas e precisam de conferência.";
export function bankPeriod(from:unknown,to:unknown):{from:string;to:string} {
  function date(value:unknown):string {
    if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(value)||value<"1900-01-01")throw new Error("OF_PERIOD_INVALID");
    const parsed=new Date(value+"T00:00:00Z");
    if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==value)throw new Error("OF_PERIOD_INVALID");
    return value;
  }
  const first=date(from),last=date(to),days=(Date.parse(last)-Date.parse(first))/86400000;
  if(days<0||days>365)throw new Error("OF_PERIOD_INVALID");
  return {from:first,to:last};
}
