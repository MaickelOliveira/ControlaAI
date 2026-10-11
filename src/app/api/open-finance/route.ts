import { NextResponse } from "next/server";
import { getSessionWithUser } from "@/lib/auth";
import { getOpenFinanceAccess,canEnrollOpenFinance } from "@/lib/open-finance-access";
import { getSupabase } from "@/lib/supabase";
import { isBankConnectReady } from "@/lib/open-finance-ready";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const auth = await getSessionWithUser();
  if (!auth || auth.session.role !== "client") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    const mode=new URL(request.url).searchParams.get("mode")??auth.user.activeMode;
    const scope=await getOpenFinanceAccess(auth.user,mode,{throwOnStorageError:true});
    if(!scope){
      if(canEnrollOpenFinance(auth.user,mode)){
        const {data,error}=await getSupabase().rpc("zelo_of_access",{p_user:auth.user.id});
        if(error)throw Error("STORAGE_UNAVAILABLE");
        if(!data)return NextResponse.json({eligibilityRequired:true,connections:[],resources:[],limits:[],bills:[],credit:[],sync:[]},{headers:{"Cache-Control":"private, no-store"}});
      }
      return NextResponse.json({error:"Não disponível"},{status:404,headers:{"Cache-Control":"private, no-store"}});
    }
    const { data, error } = await getSupabase().rpc("zelo_of_overview", {
      p_user: scope.userId, p_environment: scope.environment, p_mode: scope.mode,
    });
    if (error || !data) throw new Error("STORAGE_UNAVAILABLE");
    const connectAvailable = await isBankConnectReady(scope);
    return NextResponse.json({ ...data, contactEmail: auth.user.email, connectAvailable }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Não foi possível consultar os bancos. Tente novamente." }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
