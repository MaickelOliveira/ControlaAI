import "server-only";
import {openFinanceRpc} from "./open-finance-http";
import type {OpenFinanceScope} from "./open-finance-access";
import type {BankOverview} from "./open-finance-display";
import type {BankFinancialData,BankMovement,BankReport} from "./open-finance-report";
export async function readBankLedger(scope:OpenFinanceScope,period:{from:string;to:string}):Promise<BankFinancialData> {
  async function pages():Promise<BankReport>{
    const movements:BankMovement[]=[],seen=new Set<string>();
    let after:string|null=null,first:BankReport|null=null;
    // Bounded database reads only. Never issue a provider request from the dashboard.
    for(let page=0;page<40;page++){
      const report=await openFinanceRpc(scope,"zelo_of_report",{p_from:period.from,p_to:period.to,p_after:after}) as BankReport;
      if(!report||!Array.isArray(report.movements)||report.movements.length>50)throw Error("OF_LEDGER_INVALID");
      first??=report;movements.push(...report.movements);
      if(!report.next)return {...first,movements,next:null};
      if(seen.has(report.next))throw Error("OF_LEDGER_CURSOR");
      seen.add(report.next);after=report.next;
    }
    throw Error("OF_LEDGER_LIMIT");
  }
  const [report,overview]=await Promise.all([pages(),openFinanceRpc(scope,"zelo_of_overview",{p_environment:scope.environment})]);
  return {report,overview:overview as BankOverview};
}
