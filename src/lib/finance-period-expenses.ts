import {scheduledDates, type Schedule} from "./recurring-calendar";
import type {FinanceFilters} from "@/components/FinanceFilterBar";
import type {FinanceLedgerData,LedgerEntry} from "./finance-ledger";
import {matchesFinanceAccount} from "./finance-account-filter";
import {matchesBankFilter} from "./finance-bank-filter";
import {normalizeBankText} from "./bank-question-parser";
import {financeLoanInstallments} from "./finance-loan-installments";
import {bankForecastCategory,financeBankSchedules,unrepresentedBankSchedules} from "./finance-bank-schedules";
import {linkBankInstallmentAnchors,linkScheduledBankInstallments,projectBankInstallments} from "./bank-installment-projections";
import {bankScheduleInExpensePeriod,financeExpensePlan} from "./finance-expense-plan";
import {BILL_PAYMENT_CATEGORY,isBankBillPaymentDescription} from "./bank-bill-payment";
import {detectSubscriptions,isOccasionalCharge,projectBankRecurring} from "./detected-subscriptions";
import type {BankMovement} from "./open-finance-report";
export type PeriodRecurring=Schedule & {id:string;type:string;amount:number;category:string;description:string;status:string;nextDueDate:string};
export function matchesPeriodFilters(entry:Pick<LedgerEntry,"type"|"category"|"description">,filters:FinanceFilters){
 return (filters.type==="all"||entry.type===filters.type)&&(!filters.categories.length||filters.categories.includes(entry.category))&&(!filters.search.trim()||entry.description.toLowerCase().includes(filters.search.trim().toLowerCase()));
}
/** Dashboard and Finanças share the statement's reconciliation and forecasts.
 * A recorded installment replaces its prediction before either chart sums it. */
/** subscriptionHistory: cobranças recentes do banco usadas para prever
 * assinaturas mensais que o banco não marca como recorrentes. */
export function financePeriodExpenses<T extends PeriodRecurring>(ledger:Pick<FinanceLedgerData,"finances"|"bank"|"installmentAnchors">|null,recurring:readonly T[],filters:FinanceFilters,today:string,subscriptionHistory?:readonly BankMovement[]){
 const finances=ledger?.finances??[];
 const filteredFinances=finances.filter(entry=>matchesFinanceAccount(entry,filters.account)&&matchesPeriodFilters(entry,filters));
 const pendingFinances=filteredFinances.filter(entry=>entry.status==="pending");
 const postedFinances=filteredFinances.filter(entry=>entry.status!=="pending");
 const sortedRecs=recurring.filter(row=>(!filters.account||filters.account==="unlinked")&&row.nextDueDate>=filters.from&&row.nextDueDate<=filters.to&&matchesPeriodFilters(row,filters)).sort((a,b)=>a.nextDueDate.localeCompare(b.nextDueDate));
 const linkedDates = new Set(filteredFinances.filter(row => row.recurringId && row.autoPost !== false).map(row => row.recurringId + "|" + row.date));
 const periodOccurrences = recurring.filter(row => row.status === "active" && (!filters.account || filters.account === "unlinked") && matchesPeriodFilters(row,filters))
   .flatMap(row => scheduledDates(row, filters.from, filters.to).filter(date => !linkedDates.has(row.id + "|" + date)).map(date => ({...row, id:row.id + "|" + date, nextDueDate:date})));
 const datedPending = pendingFinances.filter(row => row.autoPost !== false);
 const incomeForecast = [...datedPending, ...periodOccurrences].reduce((sum,row) => sum + (row.type === "income" ? Math.round(row.amount * 100) : 0), 0) / 100;
 const loanInstallments=ledger?.bank?financeLoanInstallments(ledger.bank.overview,finances,filters,today):[];
 const installmentAnchors=linkBankInstallmentAnchors(ledger?.installmentAnchors?.items??[],ledger?.bank?.overview.agenda?.items??[]);
 const scheduledInstallments=linkScheduledBankInstallments(ledger?.installmentAnchors?.scheduled??[],ledger?.bank?.overview.agenda?.items??[],installmentAnchors);
 const search=normalizeBankText(filters.search);
 const projectedInstallments=!ledger?.bank||filters.type==="income"||filters.account&&!filters.account.startsWith("bank:")&&!filters.account.startsWith("institution:")?[]:
  projectBankInstallments(installmentAnchors.map(item=>({...item,currency:item.currency??ledger.bank?.overview.resources.find(resource=>resource.id===item.resource_id)?.currency??null})),ledger.bank.report.movements,{from:filters.from,to:filters.to,today},scheduledInstallments)
   .filter(item=>item.user_category!==BILL_PAYMENT_CATEGORY&&!isBankBillPaymentDescription(item.description)&&(!filters.categories.length||filters.categories.includes(bankForecastCategory(item,finances)))&&matchesBankFilter(item.institution_name,item.resource_id,filters.account)&&(!search||normalizeBankText(`${item.description} ${item.institution_name} ${item.resource_name}`).includes(search)));
 // Juros/multa de atraso e lanches que o banco marca como recorrentes não são
 // conta mensal: ficam fora da previsão e da lista.
 const bankSchedules=unrepresentedBankSchedules(financeBankSchedules(ledger?.bank?.overview.agenda?.items??[],filters,ledger?.bank?.overview.resources,finances),postedFinances,projectedInstallments,[...scheduledInstallments.flatMap(row=>row.schedule_ids),...installmentAnchors.flatMap(row=>row.source_schedule_ids??[])])
  .filter(row=>row.kind!=="recurring"||!isOccasionalCharge(row.description,bankForecastCategory(row,finances)));
 const bankOnlyFilter=filters.type==="income"||filters.account&&!filters.account.startsWith("bank:")&&!filters.account.startsWith("institution:");
 const inPeriodSchedules=bankSchedules.filter(row=>bankScheduleInExpensePeriod(row,filters.from,filters.to));
 // Recorrências que o banco só informa até o mês atual seguem nos meses seguintes.
 const continuedRecurring=bankOnlyFilter||!ledger?.bank?[]:projectBankRecurring({
  schedules:(ledger.bank.overview.agenda?.items??[]).filter(item=>item.user_category!==BILL_PAYMENT_CATEGORY&&!isBankBillPaymentDescription(item.description)),
  period:{from:filters.from,to:filters.to},today,category:item=>bankForecastCategory(item,finances),
 }).filter(item=>!inPeriodSchedules.some(row=>row.institution_name===item.institutionName&&normalizeBankText(row.description)===normalizeBankText(item.description)));
 const subscriptions=bankOnlyFilter?[]:[...continuedRecurring,...!subscriptionHistory?.length?[]:
  detectSubscriptions({
   history:subscriptionHistory,period:{from:filters.from,to:filters.to},today,
   // Só conta como "já previsto" o que o banco prevê DENTRO do período. Uma
   // recorrência com a próxima data já vencida não cobre os meses seguintes.
   bankSchedules:inPeriodSchedules,
   knownDescriptions:[...continuedRecurring.map(row=>row.description),...loanInstallments.map(row=>row.name),...recurring.map(row=>row.description),...projectedInstallments.map(row=>row.description),...postedFinances.filter(row=>row.date>=filters.from).map(row=>row.description)],
  })].filter(item=>(!filters.categories.length||filters.categories.includes(item.category))&&(!search||normalizeBankText(`${item.description} ${item.institutionName} ${item.resourceName}`).includes(search))&&matchesBankFilter(item.institutionName,item.resourceId,filters.account));
 const expensePlan=financeExpensePlan({categoryHistory:finances,posted:postedFinances,pending:datedPending,recurring:periodOccurrences,loans:loanInstallments,installments:projectedInstallments,schedules:bankSchedules,subscriptions,from:filters.from,to:filters.to});
 return {incomeForecast,filteredFinances,pendingFinances,postedFinances,sortedRecs,loanInstallments,projectedInstallments,bankSchedules,subscriptions,expensePlan};
}
