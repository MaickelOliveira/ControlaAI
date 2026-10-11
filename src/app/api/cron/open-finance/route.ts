import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getOpenFinanceOwner } from "@/lib/open-finance-owner";
import { getOpenFinanceAccess,isPublicOpenFinanceEnabled } from "@/lib/open-finance-access";
import {runPublicBankSync} from "@/lib/open-finance-worker";
import { runBankSyncPage } from "@/lib/open-finance-sync";
import { OF_HEADERS } from "@/lib/open-finance-http";
export const maxDuration=45;
export async function POST(request:Request) {
  const secret=process.env.OPEN_FINANCE_SYNC_CRON_SECRET, received=request.headers.get("authorization");
  const expected=secret&&secret.length>=32?`Bearer ${secret}`:null;
  if(!expected || !received || received.length!==expected.length || !timingSafeEqual(Buffer.from(received),Buffer.from(expected)))return NextResponse.json({error:"Não autorizado"},{status:401,headers:OF_HEADERS});
  if(process.env.OPEN_FINANCE_SYNC_ENABLED!=="true")return NextResponse.json({error:"Não disponível"},{status:404,headers:OF_HEADERS});
  try {
    const mode=new URL(request.url).searchParams.get("mode")||"personal";
    if(mode!=="personal"&&mode!=="business")return NextResponse.json({error:"Modo inválido"},{status:400,headers:OF_HEADERS});
    if(isPublicOpenFinanceEnabled()){
      const status=await runPublicBankSync(mode);
      return NextResponse.json({status},{status:status==="failed"?503:200,headers:OF_HEADERS});
    }
    const owner=await getOpenFinanceOwner();
    if(!owner)throw new Error("OF_OWNER_UNAVAILABLE");
    const scope=await getOpenFinanceAccess(owner,mode);
    if(!scope)throw new Error("OF_ACCESS_DENIED");
    const status=await runBankSyncPage(scope);
    return NextResponse.json({status},{status:status==="failed"?503:200,headers:OF_HEADERS});
  }catch{return NextResponse.json({error:"Sincronização indisponível"},{status:503,headers:OF_HEADERS});}
}
