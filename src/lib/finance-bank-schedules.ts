import {collectBankAgenda,type BankAgendaItem} from "./open-finance-schedules";
import {normalizeBankText} from "./bank-question-parser";
import {descriptionExpenseCategory} from "./expense-category";
import {matchesBankFilter} from "./finance-bank-filter";
import type {BankResource} from "./open-finance-display";
import type {LedgerEntry} from "./finance-ledger";
import type {BankInstallmentProjection} from "./bank-installment-projections";
type Filters={from:string;to:string;type:string;search:string;categories:readonly string[];account?:string};
export function bankForecastCategory(item:{description:string;kind?:string;resource_id?:string;amount?:string|null;currency?:string|null},history:readonly LedgerEntry[]=[]){
 const name=normalizeBankText(item.description);
 const known=new Set(history.filter(row=>row.included&&row.type==="expense"&&row.bank&&item.resource_id&&row.bank.resource_id===item.resource_id&&(!item.currency||row.bank.currency===item.currency)&&normalizeBankText(row.description)===name&&(item.amount==null||row.amount===Number(item.amount))).map(row=>row.category));
 return known.size===1?[...known][0]:descriptionExpenseCategory(item.description)??"Outros";
}
/** Predicted categories describe the budget without posting an expense. */
export function financeBankSchedules(items:readonly BankAgendaItem[],filters:Filters,resources:readonly Pick<BankResource,"id"|"currency">[]=[],history:readonly LedgerEntry[]=[]):BankAgendaItem[]{
 if(filters.type==="income"||filters.account&&!filters.account.startsWith("bank:")&&!filters.account.startsWith("institution:"))return [];
 const query=normalizeBankText(filters.search);
 return collectBankAgenda(items.map(item=>({...item,currency:item.currency??resources.find(resource=>resource.id===item.resource_id)?.currency??null})).filter(item=>item.kind!=="bill"&&(!filters.categories.length||filters.categories.includes(bankForecastCategory(item,history)))&&matchesBankFilter(item.institution_name,item.resource_id,filters.account)&&(!query||normalizeBankText(`${item.description} ${item.resource_name} ${item.institution_name}`).includes(query))),{from:filters.from,to:filters.to,includeUndated:true,includeObservedInstallments:true});
}
/** Hide the schedule's extra display row when the same purchase already has
 * a dated ledger/projection row. This never removes a real ledger entry. */
export function unrepresentedBankSchedules(items:readonly BankAgendaItem[],entries:readonly LedgerEntry[],projections:readonly BankInstallmentProjection[]):BankAgendaItem[]{
 return items.filter(item=>{
  if(!item.resource_id||item.amount===null)return true;
  const name=normalizeBankText(item.description);
  const projected=projections.some(row=>row.resource_id===item.resource_id&&normalizeBankText(row.description)===name&&Number(row.amount)===Number(item.amount)&&(!item.currency||item.currency===row.currency)&&item.total_installments===row.total);
  const posted=entries.some(entry=>!!entry.bank&&entry.bank.resource_id===item.resource_id&&normalizeBankText(entry.description)===name&&entry.bank.currency===item.currency&&entry.amount===Number(item.amount)&&(!item.due_date||item.due_date===entry.date)&&(item.kind!=="installment"||entry.bank.installment_number===item.observed_installments&&entry.bank.installment_count===item.total_installments));
  return !projected&&!posted;
 });
}
