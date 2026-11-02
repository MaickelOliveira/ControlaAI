import {bankDashboardLoans,type BankLoanFilters} from "./bank-dashboard";
import {ledgerAmount,ledgerCategoryGroups,type LedgerEntry} from "./finance-ledger";
import type {BankOverview} from "./open-finance-display";
import {creditPlanDates,type CreditInstallmentPlan} from "./credit-installment-plan";

export type LoanInstallment={id:string;resourceId?:string;name:string;bank:string;institutionId?:string;category:string;currency:string|null;amount:number|null;month:string;dueDate?:string;finalDueDate?:string|null;manualPlan?:CreditInstallmentPlan;recordedId?:string};
/** Bank estimates apply to the current full month. User schedules have explicit
 * dates, so they can span past and future months without claiming payment. */
export function financeLoanInstallments(overview:BankOverview,entries:readonly LedgerEntry[],filters:BankLoanFilters&{from:string;to:string},today:string):LoanInstallment[]{
 const month=today.slice(0,7),[year,number]=month.split("-").map(Number);
 const last=`${month}-${String(new Date(Date.UTC(year,number,0)).getUTCDate()).padStart(2,"0")}`;
 const current=filters.from<=`${month}-01`&&filters.to>=last;
 const plans=new Map((overview.installment_plans??[]).map(plan=>[plan.resource_id,plan]));
 const manualOverview={...overview,credit:overview.credit.map(c=>plans.has(c.resource_id)?{...c,outstanding_amount:null}:c)};
 const activeConnections=new Set(overview.connections.filter(c=>c.status==="active"&&!c.revoked_at&&(!c.consent_expires_at||Date.parse(c.consent_expires_at)>Date.parse(`${today}T00:00:00Z`))).map(c=>c.id));
 const activeResources=new Set(overview.resources.filter(r=>activeConnections.has(r.connection_id)).map(r=>r.id));
 const allLoans:LoanInstallment[]=bankDashboardLoans(manualOverview).flatMap(group=>group.loans.flatMap(loan=>{
  const plan=plans.get(loan.id),bankAmount=ledgerAmount(loan.nextInstallment==null?null:String(loan.nextInstallment));
  const base={id:loan.id,resourceId:loan.id,name:loan.name,bank:loan.bank,institutionId:loan.institutionId,category:group.category,currency:group.currency,amount:bankAmount!==null&&bankAmount>0?bankAmount:null,month,finalDueDate:loan.finalDueDate};
  if(plan)return creditPlanDates(plan,filters.from,filters.to).map(date=>({...base,id:`${loan.id}:${date.slice(0,7)}`,currency:plan.currency,amount:ledgerAmount(plan.amount),month:date.slice(0,7),dueDate:date,manualPlan:plan}));
  return current&&activeResources.has(loan.id)?[base]:[];
 }));
 const selected=new Set(bankDashboardLoans(manualOverview,filters).flatMap(group=>group.loans.map(loan=>loan.id)));
 const used=new Set<string>();
 return allLoans.filter(loan=>selected.has(loan.resourceId!)).map(loan=>{
  const matches=entries.filter(entry=>!used.has(entry.id)&&entry.included&&entry.status!=="pending"&&entry.type==="expense"&&entry.bank?.currency===loan.currency&&entry.date.slice(0,7)===loan.month&&entry.amount===loan.amount&&(
   entry.bank?.resource_id===loan.resourceId||entry.bank?.credit_resource_id===loan.resourceId||entry.category===loan.category&&entry.amount===loan.amount&&entry.bank?.institution_name===loan.bank&&allLoans.filter(other=>other.bank===loan.bank&&other.category===loan.category&&other.amount===loan.amount&&other.currency===loan.currency&&other.month===loan.month).length===1
  ));
  const recordedId=matches.length===1?matches[0].id:undefined;
  if(recordedId)used.add(recordedId);
  return {...loan,recordedId};
 });
}

/** Category totals can include the explicitly labelled monthly loan forecast.
 * An identified posted installment contributes only once. Cash balances stay posted-only. */
export function categoriesWithLoanInstallments(entries:readonly LedgerEntry[],loans:readonly LoanInstallment[]){
  const groups=new Map(ledgerCategoryGroups(entries,"expense").map(group=>[group.name,{...group,forecast:0}]));
  for(const loan of loans){
    if(loan.currency!=="BRL"||loan.amount===null||loan.recordedId)continue;
    const group=groups.get(loan.category)??{name:loan.category,value:0,forecast:0};
    group.value=(Math.round(group.value*100)+Math.round(loan.amount*100))/100;
    group.forecast=(Math.round(group.forecast*100)+Math.round(loan.amount*100))/100;
    groups.set(group.name,group);
  }
  return [...groups.values()].sort((a,b)=>b.value-a.value);
}
