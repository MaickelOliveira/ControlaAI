import {NextResponse} from "next/server";
import {openFinanceRequestScope,openFinanceRpc,OF_HEADERS} from "@/lib/open-finance-http";
import {readBankBody} from "@/lib/open-finance-body";
import {creditPixCents} from "@/lib/credit-funded-payment";
import {bankPeriod} from "@/lib/open-finance-report";
const uuid=(value:unknown):value is string=>typeof value==="string"&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
const invalid=()=>NextResponse.json({error:"Confira os dois valores e confirme se é o mesmo pagamento."},{status:400,headers:OF_HEADERS});
export async function POST(request:Request){
 const scope=await openFinanceRequestScope(request,true);if(scope instanceof Response)return scope;
 let values:Record<string,unknown>;
 try{
  const body=JSON.parse((await readBankBody(request,4096)).toString("utf8"));
  const gross=creditPixCents(body.grossAmount),payment=creditPixCents(body.paymentAmount),charges=creditPixCents(body.chargesAmount);
  const creditDate=bankPeriod(body.creditDate,body.creditDate).from,paymentDate=bankPeriod(body.paymentDate,body.paymentDate).from;
  if(!uuid(body.creditMovementId)||!uuid(body.paymentMovementId)||body.creditMovementId===body.paymentMovementId||body.confirmed!==true
   ||gross===null||payment===null||charges===null||gross<=BigInt(0)||payment<=BigInt(0)||gross!==payment+charges)return invalid();
  values={p_credit:body.creditMovementId,p_payment:body.paymentMovementId,p_gross:body.grossAmount,p_payment_amount:body.paymentAmount,p_charges:body.chargesAmount,p_confirmed:true,p_credit_date:creditDate,p_payment_date:paymentDate};
 }catch{return invalid();}
 try{
  const result=await openFinanceRpc(scope,"zelo_of_confirm_credit_pix",values);
  if(!result||typeof result!=="object"||!("id" in result)||!uuid(result.id))throw Error("OF_CONFIRMATION_FAILED");
  return NextResponse.json({ok:true},{headers:OF_HEADERS});
 }catch{return NextResponse.json({error:"Não foi possível confirmar. Atualize os registros e confira se algum já foi ligado a outro pagamento."},{status:503,headers:OF_HEADERS});}
}
export async function DELETE(request:Request){
 const scope=await openFinanceRequestScope(request,true);if(scope instanceof Response)return scope;
 let id:string;
 try{const body=JSON.parse((await readBankBody(request,4096)).toString("utf8"));if(!uuid(body.reconciliationId))return invalid();id=body.reconciliationId;}catch{return invalid();}
 try{
  const result=await openFinanceRpc(scope,"zelo_of_undo_credit_pix",{p_reconciliation:id});
  if(result!==true)return NextResponse.json({error:"Confirmação não encontrada neste espaço."},{status:404,headers:OF_HEADERS});
  return NextResponse.json({ok:true},{headers:OF_HEADERS});
 }catch{return NextResponse.json({error:"Não foi possível desfazer a confirmação. Tente novamente."},{status:503,headers:OF_HEADERS});}
}
