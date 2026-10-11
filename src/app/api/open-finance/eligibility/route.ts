import {NextResponse} from "next/server";
import {getSessionWithUser} from "@/lib/auth";
import {canEnrollOpenFinance,requireOpenFinanceOrigin} from "@/lib/open-finance-access";
import {getSupabase} from "@/lib/supabase";
import {readBankBody} from "@/lib/open-finance-body";
import {checkRateLimit} from "@/lib/rate-limit";
import {OF_HEADERS} from "@/lib/open-finance-http";
export async function POST(request:Request){
  const auth=await getSessionWithUser();
  if(!auth||auth.session.role!=="client")return NextResponse.json({error:"Não autorizado"},{status:401,headers:OF_HEADERS});
  const mode=new URL(request.url).searchParams.get("mode")??auth.user.activeMode;
  if(!canEnrollOpenFinance(auth.user,mode))return NextResponse.json({error:"Não disponível"},{status:404,headers:OF_HEADERS});
  try{requireOpenFinanceOrigin(request);}catch{return NextResponse.json({error:"Origem não autorizada"},{status:403,headers:OF_HEADERS});}
  if(!await checkRateLimit(`open-finance-enroll:${auth.user.id}`,10,60_000))return NextResponse.json({error:"Aguarde um minuto para tentar novamente."},{status:429,headers:OF_HEADERS});
  try{
    if(!request.headers.get("content-type")?.startsWith("application/json"))throw Error();
    const body=JSON.parse((await readBankBody(request,1024)).toString("utf8"));
    if(body?.countryCode!=="BR"||body?.confirmed!==true)throw Error();
  }catch{return NextResponse.json({error:"Confirme que sua conta bancária é do Brasil."},{status:400,headers:OF_HEADERS});}
  try{
    const {data,error}=await getSupabase().rpc("zelo_of_enable_brazil",{p_user:auth.user.id,p_mode:mode,p_country:"BR",p_confirmed:true});
    if(error||data!==true)throw Error();
    return NextResponse.json({ok:true},{headers:OF_HEADERS});
  }catch{return NextResponse.json({error:"Não foi possível habilitar a conexão. Fale com o suporte."},{status:503,headers:OF_HEADERS});}
}
