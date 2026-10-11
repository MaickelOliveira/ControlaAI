import {NextResponse} from "next/server";
import {openFinanceRequestScope,OF_HEADERS} from "@/lib/open-finance-http";
import {recreateProductionConsent} from "@/lib/open-finance-consent";
import {enqueueConsentCheck} from "@/lib/open-finance-sync";
import {isBankConnectReady} from "@/lib/open-finance-ready";
import {readBankBody} from "@/lib/open-finance-body";
import {checkRateLimit} from "@/lib/rate-limit";
export async function POST(request:Request,context:{params:Promise<{id:string}>}){
  const scope=await openFinanceRequestScope(request,true);if(scope instanceof Response)return scope;
  if(!await isBankConnectReady(scope))return NextResponse.json({error:"A conexão ainda não está disponível."},{status:503,headers:OF_HEADERS});
  try{const body=JSON.parse((await readBankBody(request,1024)).toString("utf8"));if(body.acceptedTerms!==true||body.journeyVersion!=="celcoin-2026-10")throw Error();}
  catch{return NextResponse.json({error:"Confira e aceite as permissões para gerar um novo link."},{status:400,headers:OF_HEADERS});}
  if(!await checkRateLimit(`open-finance-recreate:${scope.userId}`,5,60_000))return NextResponse.json({error:"Aguarde um minuto antes de gerar outro link."},{status:429,headers:OF_HEADERS});
  try{
    const result=await recreateProductionConsent(scope,(await context.params).id);
    if(result.status==="pending")await enqueueConsentCheck(scope,result.id);
    return NextResponse.json(result,{headers:OF_HEADERS});
  }catch{return NextResponse.json({error:"Não foi possível renovar a autorização. Confira o estado da conexão em Contas."},{status:503,headers:OF_HEADERS});}
}
