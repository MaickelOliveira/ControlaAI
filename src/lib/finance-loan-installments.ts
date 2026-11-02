import {bankDashboardLoans,type BankLoanFilters} from "./bank-dashboard";
import {ledgerAmount,ledgerCategoryGroups,type LedgerEntry} from "./finance-ledger";
import type {BankOverview} from "./open-finance-display";
import {creditPlanDates,creditPlanFirstDueDate,type CreditInstallmentPlan} from "./credit-installment-plan";

export type LoanInstallment={bankAmount?:number|null;bankTotalInstallments?:number|null;paidInstallments?:number|null;remainingInstallments?:number|null;totalInstallments?:number|null;id:string;resourceId?:string;name:string;bank:string;institutionId?:string;category:string;currency:string|null;amount:number|null;month:string;dueDate?:string;finalDueDate?:string|null;manualPlan?:CreditInstallmentPlan;recordedId?:string};
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
  const progress=overview.credit.find(c=>c.resource_id===loan.id);
  const paid=progress?.paid_installments;
  const plan=plans.get(loan.id),bankAmount=ledgerAmount(loan.nextInstallment==null?null:String(loan.nextInstallment));
  const bankTotal=progress?.total_installments??null;
  const manualTotal=plan?creditPlanDates(plan,plan.first_due_date,plan.last_due_date).length:null;
  const total=bankTotal??manualTotal;
  const remaining=total!=null&&paid!=null&&paid<=total?total-paid:bankTotal!=null?progress?.remaining_installments:null;
  const base={bankAmount:bankAmount!==null&&bankAmount>0?bankAmount:null,bankTotalInstallments:bankTotal,paidInstallments:paid,remainingInstallments:remaining,totalInstallments:total,id:loan.id,resourceId:loan.id,name:loan.name,bank:loan.bank,institutionId:loan.institutionId,category:group.category,currency:group.currency,amount:bankAmount!==null&&bankAmount>0?bankAmount:null,month,finalDueDate:loan.finalDueDate};
  const bankFirst=progress?.first_due_date??(bankTotal&&loan.finalDueDate?creditPlanFirstDueDate(loan.finalDueDate,bankTotal):null);
  const bankPlan=bankFirst&&loan.finalDueDate&&base.bankAmount&&group.currency&&progress?.periodicity==="MENSAL"?{resource_id:loan.id,amount:String(base.bankAmount),currency:group.currency,first_due_date:bankFirst,last_due_date:loan.finalDueDate}:null;
  const schedule=bankPlan??plan;
  if(schedule){
   const end=loan.finalDueDate??schedule.last_due_date;
   const effective={...schedule,amount:base.bankAmount!==null?String(base.bankAmount):schedule.amount,currency:base.bankAmount!==null?group.currency??schedule.currency:schedule.currency,first_due_date:bankFirst??(total&&loan.finalDueDate?creditPlanFirstDueDate(end,total):schedule.first_due_date),last_due_date:end};
   return creditPlanDates(effective,filters.from,filters.to).map(date=>({...base,id:`${loan.id}:${date.slice(0,7)}`,currency:effective.currency,amount:ledgerAmount(effective.amount),month:date.slice(0,7),dueDate:date,manualPlan:plan}));
  }
  return current&&activeResources.has(loan.id)?[base]:[];
 }));
 const selected=new Set(bankDashboardLoans(manualOverview,filters).flatMap(group=>group.loans.map(loan=>loan.id)));
 const used=new Set<string>();
 return allLoans.filter(loan=>selected.has(loan.resourceId!)).map(loan=>{
  const candidates=entries.filter(entry=>!used.has(entry.id)&&entry.included&&entry.status!=="pending"&&entry.type==="expense"&&entry.amount>0&&entry.bank?.currency===loan.currency&&entry.date.slice(0,7)===loan.month);
  // A bank-reported repayment identifies the contract, even when fees or an
  // adjusted installment change its paid amount. Amount-only clues stay strict.
  const repayments=candidates.filter(entry=>entry.bank?.credit_resource_id===loan.resourceId||entry.bank?.resource_id===loan.resourceId&&entry.bank?.source_type==="LOAN_REPAYMENT");
  const matches=repayments.length?repayments:candidates.filter(entry=>entry.amount===loan.amount&&(
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
