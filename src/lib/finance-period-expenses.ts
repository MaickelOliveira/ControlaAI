import type {FinanceFilters} from "@/components/FinanceFilterBar";
import type {FinanceLedgerData,LedgerEntry} from "./finance-ledger";
import {matchesFinanceAccount} from "./finance-account-filter";
import {matchesBankFilter} from "./finance-bank-filter";
import {normalizeBankText} from "./bank-question-parser";
import {financeLoanInstallments} from "./finance-loan-installments";
import {bankForecastCategory,financeBankSchedules,unrepresentedBankSchedules} from "./finance-bank-schedules";
import {linkBankInstallmentAnchors,linkScheduledBankInstallments,projectBankInstallments} from "./bank-installment-projections";
import {financeExpensePlan} from "./finance-expense-plan";
export type PeriodRecurring={id:string;type:string;amount:number;category:string;description:string;status:string;nextDueDate:string};
export function matchesPeriodFilters(entry:Pick<LedgerEntry,"type"|"category"|"description">,filters:FinanceFilters){
 return (filters.type==="all"||entry.type===filters.type)&&(!filters.categories.length||filters.categories.includes(entry.category))&&(!filters.search.trim()||entry.description.toLowerCase().includes(filters.search.trim().toLowerCase()));
}
/** Dashboard and Finanças share the statement's reconciliation and forecasts.
 * A recorded installment replaces its prediction before either chart sums it. */
export function financePeriodExpenses<T extends PeriodRecurring>(ledger:Pick<FinanceLedgerData,"finances"|"bank"|"installmentAnchors">|null,recurring:readonly T[],filters:FinanceFilters,today:string){
 const finances=ledger?.finances??[];
 const filteredFinances=finances.filter(entry=>matchesFinanceAccount(entry,filters.account)&&matchesPeriodFilters(entry,filters));
 const pendingFinances=filteredFinances.filter(entry=>entry.status==="pending");
 const postedFinances=filteredFinances.filter(entry=>entry.status!=="pending");
 const sortedRecs=recurring.filter(row=>(!filters.account||filters.account==="unlinked")&&row.nextDueDate>=filters.from&&row.nextDueDate<=filters.to&&matchesPeriodFilters(row,filters)).sort((a,b)=>a.nextDueDate.localeCompare(b.nextDueDate));
 const loanInstallments=ledger?.bank?financeLoanInstallments(ledger.bank.overview,finances,filters,today):[];
 const installmentAnchors=linkBankInstallmentAnchors(ledger?.installmentAnchors?.items??[],ledger?.bank?.overview.agenda?.items??[]);
 const scheduledInstallments=linkScheduledBankInstallments(ledger?.installmentAnchors?.scheduled??[],ledger?.bank?.overview.agenda?.items??[],installmentAnchors);
 const search=normalizeBankText(filters.search);
 const projectedInstallments=!ledger?.bank||filters.type==="income"||filters.account&&!filters.account.startsWith("bank:")&&!filters.account.startsWith("institution:")?[]:
  projectBankInstallments(installmentAnchors.map(item=>({...item,currency:item.currency??ledger.bank?.overview.resources.find(resource=>resource.id===item.resource_id)?.currency??null})),ledger.bank.report.movements,{from:filters.from,to:filters.to,today},scheduledInstallments)
   .filter(item=>(!filters.categories.length||filters.categories.includes(bankForecastCategory(item,finances)))&&matchesBankFilter(item.institution_name,item.resource_id,filters.account)&&(!search||normalizeBankText(`${item.description} ${item.institution_name} ${item.resource_name}`).includes(search)));
 const bankSchedules=unrepresentedBankSchedules(financeBankSchedules(ledger?.bank?.overview.agenda?.items??[],filters,ledger?.bank?.overview.resources,finances),postedFinances,projectedInstallments,[...scheduledInstallments.flatMap(row=>row.schedule_ids),...installmentAnchors.flatMap(row=>row.source_schedule_ids??[])]);
 const expensePlan=financeExpensePlan({categoryHistory:finances,posted:postedFinances,pending:pendingFinances,recurring:sortedRecs,loans:loanInstallments,installments:projectedInstallments,schedules:bankSchedules,from:filters.from,to:filters.to});
 return {filteredFinances,pendingFinances,postedFinances,sortedRecs,loanInstallments,projectedInstallments,bankSchedules,expensePlan};
}
