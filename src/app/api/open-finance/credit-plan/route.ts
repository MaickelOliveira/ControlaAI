import {NextResponse} from "next/server";
import {openFinanceRequestScope,openFinanceRpc,OF_HEADERS} from "@/lib/open-finance-http";
import {readBankBody} from "@/lib/open-finance-body";
import {validCreditPlan,type CreditInstallmentPlan} from "@/lib/credit-installment-plan";
import {runWithCompanyRequest} from "@/lib/company-context";
export async function PUT(request:Request){
 return runWithCompanyRequest(async()=>{
  const scope=await openFinanceRequestScope(request,true);
  if(scope instanceof Response)return scope;
  let plan:CreditInstallmentPlan;
  try{
   plan=JSON.parse((await readBankBody(request,2048)).toString("utf8"));
   if(!validCreditPlan(plan)||!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(plan.resource_id))throw Error("INVALID_PLAN");
  }catch{return NextResponse.json({error:"Informe um valor positivo, a moeda e os vencimentos inicial e final válidos."},{status:400,headers:OF_HEADERS});}
  try{
   const {resource_id,...values}=plan;
   const saved=await openFinanceRpc(scope,"zelo_of_set_credit_plan",{p_resource:resource_id,p_plan:{amount:values.amount,currency:values.currency,first_due_date:values.first_due_date,last_due_date:values.last_due_date}});
   if(saved!==true)return NextResponse.json({error:"Financiamento não encontrado neste espaço."},{status:404,headers:OF_HEADERS});
   return NextResponse.json({ok:true},{headers:OF_HEADERS});
  }catch{return NextResponse.json({error:"Não foi possível salvar a parcela. Confira a moeda e tente novamente."},{status:503,headers:OF_HEADERS});}
 });
}
