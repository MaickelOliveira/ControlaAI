import "server-only";
import {getFinancesInRangeStrict,type FinanceMode} from "./finances";
import {getRecurringByUser} from "./recurring";
import {getOpenFinanceAccess,type OpenFinanceIdentity} from "./open-finance-access";
import {openFinanceRpc} from "./open-finance-http";
import {readUnifiedFinances} from "./unified-finances";
import {ledgerBalance,createFinanceLedger} from "./finance-ledger";
import {financeCoverageNotice} from "./finance-query";
import {collectUpcomingFinanceItems,buildBalanceForecast} from "./upcoming-finances";
import {collectBankAgenda,type BankAgenda} from "./open-finance-schedules";

export async function readBankAgenda(user:OpenFinanceIdentity,mode:FinanceMode,range:{from:string;to:string;includeUndated?:boolean}):Promise<BankAgenda>{
  const scope=await getOpenFinanceAccess(user,mode,{throwOnStorageError:true});
  if(!scope)return {items:[],incomplete:false};
  const result=await openFinanceRpc(scope,"zelo_of_agenda",{p_from:range.from,p_to:range.to,p_undated:range.includeUndated??false}) as BankAgenda;
  if(!result||!Array.isArray(result.items)||typeof result.incomplete!=="boolean")throw Error("OF_AGENDA_UNAVAILABLE");
  return {...result,items:collectBankAgenda(result.items.map(item=>({...item,mode})),range)};
}
/** Same financial agenda for daily/weekly briefings and upcoming-payment queries. */
export async function readFinancialAgenda(user:OpenFinanceIdentity,mode:FinanceMode|undefined,range:{from:string;to:string;today:string;includeUndated?:boolean;includeBank?:boolean}){
  const modes:FinanceMode[]=mode?[mode]:["personal","business"];
  const results=await Promise.all(modes.map(async currentMode=>{
    const through=range.to<range.today?range.to:range.today;
    const [pending,recurring,realized,bank]=await Promise.all([
      getFinancesInRangeStrict(user.id,currentMode,undefined,undefined,true),
      getRecurringByUser(user.id,currentMode,"active",true),
      range.from>through?Promise.resolve({entries:[],bank:null}):range.includeBank===false?getFinancesInRangeStrict(user.id,currentMode,range.from,through).then(rows=>({entries:createFinanceLedger(rows,[],currentMode),bank:null})):readUnifiedFinances(user,currentMode,range.from,through),
      range.includeBank===false?Promise.resolve({items:[],incomplete:false}):readBankAgenda(user,currentMode,range),
    ]);
    const commitments=collectUpcomingFinanceItems(pending,recurring,{...range,mode:currentMode});
    return {commitments,bank,forecast:buildBalanceForecast(currentMode,ledgerBalance(realized.entries).balance,commitments),coverage:financeCoverageNotice(realized.bank,realized.entries)};
  }));
  return {commitments:results.flatMap(r=>r.commitments),bank:{items:results.flatMap(r=>r.bank.items),incomplete:results.some(r=>r.bank.incomplete)},forecasts:results.map(r=>r.forecast),coverage:[...new Set(results.map(r=>r.coverage).filter(Boolean))].join("\n")};
}
