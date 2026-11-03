import "server-only";
import {mergeCreditPayments} from "./credit-payment-ledger";
import {validCreditPlan,type CreditInstallmentPlan} from "./credit-installment-plan";
import {openFinanceRpc} from "./open-finance-http";
import type {OpenFinanceScope} from "./open-finance-access";
import type {BankOverview,BankCredit} from "./open-finance-display";
import {collapseBankInstallmentFragments} from "./open-finance-schedules";
import type {BankFinancialData,BankMovement,BankReport} from "./open-finance-report";
import type {BankInstallmentAnchor,ScheduledBankInstallment} from "./bank-installment-projections";
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
  const [report,overview,credit]=await Promise.all([pages(),readBankOverview(scope),readCreditData(scope,period)]);
  return credit?{report:{...report,movements:mergeCreditPayments(report.movements,credit.payments)},overview:{...overview,...(credit.progress?.length?{credit:overview.credit.map(row=>({...row,...credit.progress?.find(progress=>progress.resource_id===row.resource_id)}))}:{}),installment_plans:credit.plans,manual_installments_available:true}}:{report,overview};
}

export async function readBankInstallmentAnchors(scope:OpenFinanceScope):Promise<{items:BankInstallmentAnchor[];scheduled?:ScheduledBankInstallment[];incomplete:boolean}> {
  const result=await openFinanceRpc(scope,"zelo_of_installment_anchors") as {items?:unknown;scheduled?:unknown;incomplete?:unknown};
  if(!result||!Array.isArray(result.items)||result.items.length>2000||typeof result.incomplete!=="boolean"||result.items.some(item=>{
    const row=item as Partial<BankInstallmentAnchor>;
    return !row||typeof row.id!=="string"||typeof row.resource_id!=="string"||typeof row.description!=="string"||typeof row.resource_name!=="string"||typeof row.institution_name!=="string"||typeof row.amount!=="string"||typeof row.bill_month!=="string"||typeof row.synced_at!=="string"||typeof row.observed_installments!=="number"||typeof row.total_installments!=="number";
  }))throw Error("OF_INSTALLMENT_ANCHORS_INVALID");
  if(result.scheduled!==undefined&&(!Array.isArray(result.scheduled)||result.scheduled.length>4000||result.scheduled.some(item=>{
    const row=item as Partial<ScheduledBankInstallment>;
    return !row||typeof row.id!=="string"||typeof row.resource_id!=="string"||typeof row.description!=="string"||typeof row.resource_name!=="string"||typeof row.institution_name!=="string"||typeof row.date!=="string"||typeof row.bill_month!=="string"||typeof row.synced_at!=="string"||typeof row.amount!=="string"||row.currency!==null&&typeof row.currency!=="string"||typeof row.installment_number!=="number"||typeof row.installment_count!=="number"||row.direction!=="debit"||row.resource_type!=="card"||!Array.isArray(row.schedule_ids)||row.schedule_ids.length>1000||row.schedule_ids.some(id=>typeof id!=="string");
  })))throw Error("OF_SCHEDULED_INSTALLMENTS_INVALID");
  return result as {items:BankInstallmentAnchor[];scheduled?:ScheduledBankInstallment[];incomplete:boolean};
}

type CreditData={payments:BankMovement[];plans:CreditInstallmentPlan[];progress?:Array<Pick<BankCredit,"resource_id"|"paid_installments"|"remaining_installments"|"total_installments"|"first_due_date"|"periodicity">>};
export async function readCreditData(scope:OpenFinanceScope,period:{from:string;to:string}):Promise<CreditData|null>{
 let value:unknown;
 try{value=await openFinanceRpc(scope,"zelo_of_credit_data",{p_from:period.from,p_to:period.to});}
 catch(error){if(error instanceof Error&&error.message==="OF_FUNCTION_UNAVAILABLE")return null;throw error;}
 const result=value as Partial<CreditData>;
 if(result?.progress!==undefined&&(!Array.isArray(result.progress)||result.progress.length>2000||result.progress.some(row=>!row||typeof row.resource_id!=="string"||[row.paid_installments,row.remaining_installments,row.total_installments].some(count=>count!==null&&count!==undefined&&(!Number.isInteger(count)||count<0||count>10000)))))throw Error("OF_CREDIT_DATA_INVALID");
 if(result.progress?.some(row=>[row.first_due_date].some(date=>date!=null&&(typeof date!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))))||row.periodicity!=null&&typeof row.periodicity!=="string"))throw Error("OF_CREDIT_DATA_INVALID");
 if(!result||!Array.isArray(result.payments)||result.payments.length>2000||!Array.isArray(result.plans)||result.plans.length>2000||result.plans.some(p=>!validCreditPlan(p))||result.payments.some(p=>!p||typeof p.id!=="string"||typeof p.resource_id!=="string"||typeof p.resource_name!=="string"||typeof p.institution_name!=="string"||!["loan","financing"].includes(p.resource_type)||p.source_type!=="LOAN_REPAYMENT"||p.direction!=="debit"||typeof p.date!=="string"||p.date<period.from||p.date>period.to||typeof p.amount!=="string"||!/^\d{1,16}(\.\d{1,8})?$/.test(p.amount)||Number(p.amount)<=0||typeof p.currency!=="string"||!/^[A-Z]{3}$/.test(p.currency)))throw Error("OF_CREDIT_DATA_INVALID");
 return result as CreditData;
}
