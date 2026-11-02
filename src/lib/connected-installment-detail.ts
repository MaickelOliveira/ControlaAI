import "server-only";
import {getOpenFinanceAccess,type OpenFinanceIdentity} from "./open-finance-access";
import {readBankOverview,readCreditData,readBankInstallmentAnchors} from "./finance-ledger-storage";
import {getRecurringByUser} from "./recurring";
import {getImportedInstallmentStatuses} from "./finances";
import {formatInstallmentDetail,installmentDetailRows,type InstallmentDetailQuestion} from "./installment-detail";
import type {BankOverview} from "./open-finance-display";
import type {BankInstallmentAnchor} from "./bank-installment-projections";
export async function connectedInstallmentDetailAnswer(user:OpenFinanceIdentity,mode:"personal"|"business",question:InstallmentDetailQuestion,today:string){
 const [registered,imported]=await Promise.allSettled([getRecurringByUser(user.id,mode,undefined,true),getImportedInstallmentStatuses(user.id,mode)]);
 let partial=registered.status==="rejected"||imported.status==="rejected",overview:BankOverview|null=null,anchors:BankInstallmentAnchor[]=[],label=mode==="personal"?"Pessoal":"Empresa";
 if(process.env.OPEN_FINANCE_WHATSAPP_ENABLED==="true")try{
  const scope=await getOpenFinanceAccess(user,mode,{throwOnStorageError:true});
  if(scope){
   label=mode==="personal"?"Pessoal":`Empresa${scope.companyName?` · ${scope.companyName}`:""}`;
   const [baseResult,creditResult,purchasesResult]=await Promise.allSettled([readBankOverview(scope),readCreditData(scope,{from:today,to:today}),readBankInstallmentAnchors(scope)]);
   const base=baseResult.status==="fulfilled"?baseResult.value:null,credit=creditResult.status==="fulfilled"?creditResult.value:null,purchases=purchasesResult.status==="fulfilled"?purchasesResult.value:null;
   if(!base)throw Error("BANK_DETAIL_UNAVAILABLE");
   overview={...base,credit:base.credit.map(row=>({...row,...credit?.progress?.find(p=>p.resource_id===row.resource_id)})),installment_plans:credit?.plans??base.installment_plans};anchors=purchases?.items??[];
   partial ||= !purchases||purchases.incomplete||credit===null||!!base.truncated||!!base.agenda?.incomplete;
  }
 }catch{partial=true;}
 return formatInstallmentDetail(installmentDetailRows(overview,anchors,registered.status==="fulfilled"?registered.value:[],imported.status==="fulfilled"?imported.value:[],today),question,label,partial);
}
