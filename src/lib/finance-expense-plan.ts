import {ledgerAmount,ledgerBalance,ledgerCategoryGroups,type LedgerEntry} from "./finance-ledger";
import type {LoanInstallment} from "./finance-loan-installments";
import type {BankInstallmentProjection} from "./bank-installment-projections";
import type {BankAgendaItem} from "./open-finance-schedules";
import {bankForecastCategory} from "./finance-bank-schedules";

type RecurringExpense={id:string;type:string;amount:number;category:string;status:string};
type Inputs={categoryHistory?:readonly LedgerEntry[];posted:readonly LedgerEntry[];pending:readonly LedgerEntry[];recurring:readonly RecurringExpense[];loans:readonly LoanInstallment[];installments:readonly BankInstallmentProjection[];schedules:readonly BankAgendaItem[];from:string;to:string};
export function bankScheduleInExpensePeriod(row:BankAgendaItem,from:string,to:string):boolean {
 if(row.due_date)return row.due_date>=from&&row.due_date<=to;
 if(row.kind!=="installment"||!row.last_observed_month||!row.last_observed_installment)return false;
 const monthIndex=(date:string)=>Number(date.slice(0,4))*12+Number(date.slice(5,7));
 const position=row.last_observed_installment+monthIndex(from)-monthIndex(row.last_observed_month);
 const [year,month]=from.slice(0,7).split("-").map(Number);
 const monthEnd=`${from.slice(0,7)}-${String(new Date(Date.UTC(year,month,0)).getUTCDate()).padStart(2,"0")}`;
 return from.endsWith("-01")&&to===monthEnd&&position>=1&&position<=(row.total_installments??0);
}
/** The caller supplies the same filtered, reconciled rows shown in the statement.
 * Forecasts never become ledger entries or change the realized cash balance. */
export function financeExpensePlan(input:Inputs){
 const recorded=ledgerBalance(input.posted).expense;
 const groups=new Map(ledgerCategoryGroups(input.posted,"expense").map(g=>[g.name,{...g,forecast:0}]));
 let forecastCents=0,unquantified=0;
 const seen=new Set<string>();
 function add(id:string,category:string,amount:number|null,currency:string|null="BRL"){
  if(seen.has(id))return;seen.add(id);
  if(currency!=="BRL"||amount===null||!Number.isFinite(amount)||amount<=0){unquantified++;return;}
  const cents=Math.round(amount*100);forecastCents+=cents;
  const group=groups.get(category)??{name:category,value:0,forecast:0};
  group.value=(Math.round(group.value*100)+cents)/100;
  group.forecast=(Math.round(group.forecast*100)+cents)/100;
  groups.set(category,group);
 }
 for(const row of input.pending)if(row.type==="expense")add(`pending:${row.id}`,row.category,row.amount);
 for(const row of input.recurring)if(row.type==="expense"&&row.status==="active")add(`recurring:${row.id}`,row.category,row.amount);
 for(const row of input.loans)if(!row.recordedId)add(`loan:${row.id}`,row.category,row.amount,row.currency);
 for(const row of input.installments)add(`installment:${row.id}:${row.month}`,bankForecastCategory(row,input.categoryHistory??input.posted),ledgerAmount(row.amount),row.currency);
 for(const row of input.schedules){
  if(row.kind==="bill"||row.payment_evidence)continue;
  // An observation with no month cannot be charged to every selected month.
  if(!bankScheduleInExpensePeriod(row,input.from,input.to)){unquantified++;continue;}
  add(`schedule:${row.kind}:${row.id}`,bankForecastCategory(row,input.categoryHistory??input.posted),ledgerAmount(row.amount),row.currency);
 }
 const forecast=forecastCents/100;
 return {recorded,forecast,total:(Math.round(recorded*100)+forecastCents)/100,unquantified,groups:[...groups.values()].sort((a,b)=>b.value-a.value)};
}
