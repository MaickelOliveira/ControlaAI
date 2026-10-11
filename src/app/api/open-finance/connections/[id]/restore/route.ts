import {NextResponse} from "next/server";
import {openFinanceRequestScope,openFinanceRpc,OF_HEADERS} from "@/lib/open-finance-http";
import {polpUuid} from "@/lib/polp-production";
import {checkRateLimit} from "@/lib/rate-limit";
export async function POST(request:Request,context:{params:Promise<{id:string}>}) {
  const scope=await openFinanceRequestScope(request,true);
  if(scope instanceof Response)return scope;
  if(!await checkRateLimit(`open-finance-manage:${scope.userId}`,10,60_000))return NextResponse.json({error:"Aguarde um minuto antes de tentar novamente."},{status:429,headers:OF_HEADERS});
  try{
    await openFinanceRpc(scope,"zelo_of_connection_visibility",{p_id:polpUuid((await context.params).id),p_archived:false});
    return NextResponse.json({ok:true},{headers:OF_HEADERS});
  }catch{return NextResponse.json({error:"Não foi possível restaurar a tentativa na lista. Tente novamente."},{status:503,headers:OF_HEADERS});}
}
