import {bankDashboardLoans,type BankLoanFilters} from "./bank-dashboard";
import {ledgerAmount,ledgerCategoryGroups,type LedgerEntry} from "./finance-ledger";
import type {BankOverview} from "./open-finance-display";

export type LoanInstallment={id:string;name:string;bank:string;institutionId?:string;category:string;currency:string|null;amount:number|null;month:string;recordedId?:string};
/** Current contract installments are a monthly forecast, never a posted payment.
 * No payment day or historical installment is inferred from the final contract date. */
export function financeLoanInstallments(overview:BankOverview,entries:readonly LedgerEntry[],filters:BankLoanFilters&{from:string;to:string},today:string):LoanInstallment[]{
  const month=today.slice(0,7),[year,number]=month.split("-").map(Number);
  const last=`${month}-${String(new Date(Date.UTC(year,number,0)).getUTCDate()).padStart(2,"0")}`;
  if(filters.from>`${month}-01`||filters.to<last)return [];
  const activeConnections=new Set(overview.connections.filter(c=>c.status==="active"&&!c.revoked_at&&(!c.consent_expires_at||Date.parse(c.consent_expires_at)>Date.parse(`${today}T00:00:00Z`))).map(c=>c.id));
  const activeResources=new Set(overview.resources.filter(r=>activeConnections.has(r.connection_id)).map(r=>r.id));
  const allLoans=bankDashboardLoans(overview).flatMap(group=>group.loans.filter(loan=>activeResources.has(loan.id)).map(loan=>({id:loan.id,name:loan.name,bank:loan.bank,institutionId:loan.institutionId,category:group.category,currency:group.currency,amount:ledgerAmount(loan.nextInstallment==null?null:String(loan.nextInstallment)),month})));
  const selected=new Set(bankDashboardLoans(overview,filters).flatMap(group=>group.loans.map(loan=>loan.id)));
  const loans=allLoans.filter(loan=>selected.has(loan.id));
  const used=new Set<string>();
  return loans.map(loan=>{
    const matches=entries.filter(entry=>!used.has(entry.id)&&entry.included&&entry.status!=="pending"&&entry.type==="expense"&&entry.category===loan.category&&entry.bank?.currency===loan.currency&&entry.date.slice(0,7)===month&&entry.amount===loan.amount&&(
      entry.bank?.resource_id===loan.id||entry.bank?.institution_name===loan.bank&&allLoans.filter(other=>other.bank===loan.bank&&other.category===loan.category&&other.amount===loan.amount&&other.currency===loan.currency).length===1
    ));
    // Ambiguous payments stay visible; amount alone is never payment identity.
    const recordedId=matches.length===1?matches[0].id:undefined;
    if(recordedId)used.add(recordedId);
    return {...loan,amount:loan.amount!==null&&loan.amount>0?loan.amount:null,recordedId};
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
