import "server-only";
import {getFinancesInRangeStrict} from "./finances";
import {getOpenFinanceAccess,type OpenFinanceIdentity} from "./open-finance-access";
import {bankPeriod} from "./open-finance-report";
import {readBankLedger} from "./finance-ledger-storage";
import {identifyFinanceAuthors} from "./finance-attribution";
import type {WppPhoneLink} from "./wpp-phone-links";
import {createFinanceLedger} from "./finance-ledger";
export async function readUnifiedFinances(user:OpenFinanceIdentity,mode:"personal"|"business",from:unknown,to:unknown,authors?:{name:string;participants:readonly WppPhoneLink[]}){
  const period=bankPeriod(from,to),scope=await getOpenFinanceAccess(user,mode,{throwOnStorageError:true});
  const [records,bank]=await Promise.all([getFinancesInRangeStrict(user.id,mode,period.from,period.to),scope?readBankLedger(scope,period):null]);
  const named = authors ? identifyFinanceAuthors(records, {id:user.id, name:authors.name}, authors.participants) : records;
  return {entries:createFinanceLedger(named,bank?.report.movements??[],mode),bank};
}
