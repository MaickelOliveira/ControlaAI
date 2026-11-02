import {NextResponse} from "next/server";
import {openFinanceRequestScope,OF_HEADERS} from "@/lib/open-finance-http";
import {runWithCompanyRequest} from "@/lib/company-context";
import {readProductionSyncStatus} from "@/lib/open-finance-sync-status";
import {checkRateLimit} from "@/lib/rate-limit";
export const dynamic="force-dynamic";
export async function GET(request:Request,context:{params:Promise<{id:string}>}){
 return runWithCompanyRequest(async()=>{
  const scope=await openFinanceRequestScope(request);
  if(scope instanceof Response)return scope;
  if(!await checkRateLimit(`of-sync-status:${scope.userId}`,3,60_000))return NextResponse.json({error:"Aguarde um minuto para consultar novamente."},{status:429,headers:OF_HEADERS});
  try{return NextResponse.json(await readProductionSyncStatus(scope,(await context.params).id),{headers:OF_HEADERS});}
  catch{return NextResponse.json({error:"Não foi possível consultar o cronograma do banco."},{status:503,headers:OF_HEADERS});}
 });
}
