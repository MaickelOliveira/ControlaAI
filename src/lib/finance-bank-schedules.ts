import {collectBankAgenda,type BankAgendaItem} from "./open-finance-schedules";
import {normalizeBankText} from "./bank-question-parser";
type Filters={from:string;to:string;type:string;search:string;categories:readonly string[];account?:string};
/** Forecasts are not posted expenses and have no authoritative category. */
export function financeBankSchedules(items:readonly BankAgendaItem[],filters:Filters):BankAgendaItem[]{
 if(filters.type==="income"||filters.categories.length||filters.account&&!filters.account.startsWith("bank:"))return [];
 const query=normalizeBankText(filters.search);
 return collectBankAgenda(items.filter(item=>item.kind!=="bill"&&(!filters.account||item.resource_id===filters.account.slice(5))&&(!query||normalizeBankText(`${item.description} ${item.resource_name} ${item.institution_name}`).includes(query))),{from:filters.from,to:filters.to,includeUndated:true,includeObservedInstallments:true});
}
