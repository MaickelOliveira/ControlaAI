import {NextResponse} from "next/server";
import {openFinanceRequestScope,OF_HEADERS} from "@/lib/open-finance-http";
import {removeBankAttempt} from "@/lib/open-finance-connections";
import {checkRateLimit} from "@/lib/rate-limit";
export async function POST(request:Request,context:{params:Promise<{id:string}>}) {
  const scope=await openFinanceRequestScope(request,true);
  if(scope instanceof Response)return scope;
  if(!await checkRateLimit(`open-finance-manage:${scope.userId}`,10,60_000))return NextResponse.json({error:"Aguarde um minuto antes de tentar novamente."},{status:429,headers:OF_HEADERS});
  try{
    await removeBankAttempt(scope,(await context.params).id);
    return NextResponse.json({ok:true},{headers:OF_HEADERS});
  }catch{return NextResponse.json({error:"Não foi possível confirmar a remoção. Atualize a página; se o banco já estiver conectado, use Desconectar banco. Uma tentativa de cancelamento pendente pode ser repetida."},{status:503,headers:OF_HEADERS});}
}
