import "server-only";
import {openFinanceRpc} from "./open-finance-http";
import type {OpenFinanceScope} from "./open-finance-access";
import type {BankOverview} from "./open-finance-display";
import {collapseBankInstallmentFragments} from "./open-finance-schedules";
import type {BankFinancialData,BankMovement,BankReport} from "./open-finance-report";
import type {BankInstallmentAnchor} from "./bank-installment-projections";
const overviewReadsKey=Symbol.for("zelo.pendingBankOverviewReads");
const registry=globalThis as typeof globalThis & {[overviewReadsKey]?:Map<string,Promise<BankOverview>>};
const pendingOverviews=registry[overviewReadsKey]??(registry[overviewReadsKey]=new Map<string,Promise<BankOverview>>());

/** Combine concurrent reads of the same authorized overview, never completed
 * results. Every later read reaches storage again; consumers get separate objects. */
export async function readBankOverview(scope:OpenFinanceScope):Promise<BankOverview>{
  if(process.env.MULTI_COMPANY_ENABLED==="true"&&!scope.companyId)throw Error("OF_COMPANY_SCOPE_MISSING");
  const key=JSON.stringify([scope.userId,scope.mode,scope.environment,scope.companyId??null]);
  let pending=pendingOverviews.get(key);
  if(!pending){
    const load=async()=>{
      const overview=await openFinanceRpc(scope,"zelo_of_overview",{p_environment:scope.environment}) as BankOverview;
      return overview.agenda?{...overview,agenda:{...overview.agenda,items:collapseBankInstallmentFragments(overview.agenda.items)}}:overview;
    };
    if(pendingOverviews.size>=128)return structuredClone(await load());
    pending=load().finally(()=>{if(pendingOverviews.get(key)===pending)pendingOverviews.delete(key);});
    pendingOverviews.set(key,pending);
  }
  return structuredClone(await pending);
}
export async function readBankLedger(scope:OpenFinanceScope,period:{from:string;to:string}):Promise<BankFinancialData> {
  async function pages():Promise<BankReport>{
    if(process.env.OPEN_FINANCE_BATCH_REPORT_ENABLED==="true"){
      const report=await openFinanceRpc(scope,"zelo_of_ledger_report",{p_from:period.from,p_to:period.to}) as BankReport;
      if(!report||!Array.isArray(report.movements))throw Error("OF_LEDGER_INVALID");
      if(report.movements.length>2000||report.next)throw Error("OF_LEDGER_LIMIT");
      return report;
    }
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
  const [report,overview]=await Promise.all([pages(),readBankOverview(scope)]);
  return {report,overview};
}

export async function readBankInstallmentAnchors(scope:OpenFinanceScope):Promise<{items:BankInstallmentAnchor[];incomplete:boolean}> {
  const result=await openFinanceRpc(scope,"zelo_of_installment_anchors") as {items?:unknown;incomplete?:unknown};
  if(!result||!Array.isArray(result.items)||result.items.length>2000||typeof result.incomplete!=="boolean"||result.items.some(item=>{
    const row=item as Partial<BankInstallmentAnchor>;
    return !row||typeof row.id!=="string"||typeof row.resource_id!=="string"||typeof row.description!=="string"||typeof row.resource_name!=="string"||typeof row.institution_name!=="string"||typeof row.amount!=="string"||typeof row.bill_month!=="string"||typeof row.synced_at!=="string"||typeof row.observed_installments!=="number"||typeof row.total_installments!=="number";
  }))throw Error("OF_INSTALLMENT_ANCHORS_INVALID");
  return result as {items:BankInstallmentAnchor[];incomplete:boolean};
}
