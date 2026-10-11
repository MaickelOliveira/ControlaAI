import {NextResponse} from "next/server";
import {openFinanceRequestScope,OF_HEADERS} from "@/lib/open-finance-http";
import {readBankBill} from "@/lib/open-finance-bills";
import {bankBillPdf} from "@/lib/bank-bill-pdf";
import {checkRateLimit} from "@/lib/rate-limit";
export const dynamic="force-dynamic";
export async function GET(request:Request,context:{params:Promise<{id:string}>}){
  const scope=await openFinanceRequestScope(request);if(scope instanceof Response)return scope;
  if(!await checkRateLimit(`bank-bill:${scope.userId}`,20,60000))return NextResponse.json({error:"Aguarde um momento antes de baixar novamente."},{status:429,headers:OF_HEADERS});
  const {id}=await context.params;
  if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id))return NextResponse.json({error:"Fatura não encontrada."},{status:404,headers:OF_HEADERS});
  try{
    const document=await readBankBill(scope,id);
    return new NextResponse(new Uint8Array(bankBillPdf(document,scope.mode)),{headers:{...OF_HEADERS,"Content-Type":"application/pdf","Content-Disposition":`attachment; filename="demonstrativo-zelo-${document.bill.due_date??"cartao"}.pdf"`,"X-Content-Type-Options":"nosniff","Content-Security-Policy":"sandbox"}});
  }catch{return NextResponse.json({error:"Não foi possível gerar o demonstrativo desta fatura. Confira sua conta e tente novamente."},{status:503,headers:OF_HEADERS});}
}
