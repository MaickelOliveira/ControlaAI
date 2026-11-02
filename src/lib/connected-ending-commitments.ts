import "server-only";
import {getOpenFinanceAccess,type OpenFinanceIdentity} from "./open-finance-access";
import {readBankOverview,readCreditData,readBankInstallmentAnchors} from "./finance-ledger-storage";
import {manualEndingCommitments,bankEndingCommitments,formatEndingCommitments} from "./ending-commitments";
import type {RecurringTransaction} from "./recurring";
import type {ImportedInstallmentStatus} from "./finances";

export async function connectedEndingCommitmentsAnswer(user:OpenFinanceIdentity,mode:"personal"|"business",today:string,cutoff:string,registered:readonly RecurringTransaction[],imported:readonly ImportedInstallmentStatus[],locale?:string){
 const rows=manualEndingCommitments(registered,imported);let partial=false,label=mode==="personal"?"Pessoal":"Empresa";
 if(process.env.OPEN_FINANCE_WHATSAPP_ENABLED==="true")try{
  const scope=await getOpenFinanceAccess(user,mode,{throwOnStorageError:true});
  if(scope){
   label=mode==="personal"?"Pessoal":`Empresa${scope.companyName?` · ${scope.companyName}`:""}`;
   const [base,credit,anchors]=await Promise.all([readBankOverview(scope),readCreditData(scope,{from:today,to:today}),readBankInstallmentAnchors(scope)]);
   const overview={...base,credit:base.credit.map(row=>({...row,...credit?.progress?.find(p=>p.resource_id===row.resource_id)})),installment_plans:credit?.plans??base.installment_plans};
   rows.push(...bankEndingCommitments(overview,anchors.items,today));
   partial=anchors.incomplete||credit===null||!!base.truncated||!!base.agenda?.incomplete;
  }
 }catch{partial=true;}
 return formatEndingCommitments(rows,today,cutoff,label,partial,locale);
}
