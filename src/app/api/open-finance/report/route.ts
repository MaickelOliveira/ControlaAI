import {NextResponse} from "next/server";
import {openFinanceRequestScope,openFinanceRpc,OF_HEADERS} from "@/lib/open-finance-http";
import {bankPeriod} from "@/lib/open-finance-report";
import {polpUuid} from "@/lib/polp-production";
export const dynamic="force-dynamic";
export async function GET(request:Request) {
  const scope=await openFinanceRequestScope(request);
  if(scope instanceof Response)return scope;
  const query=new URL(request.url).searchParams;
  let period,after;
  try{period=bankPeriod(query.get("from"),query.get("to"));after=query.has("after")?polpUuid(query.get("after")):null;}
  catch{return NextResponse.json({error:"Escolha um período válido de até 366 dias."},{status:400,headers:OF_HEADERS});}
  try{
    const [report,overview]=await Promise.all([
      openFinanceRpc(scope,"zelo_of_report",{p_from:period.from,p_to:period.to,p_after:after}),
      openFinanceRpc(scope,"zelo_of_overview",{p_environment:scope.environment})
    ]);
    return NextResponse.json({report,overview},{headers:OF_HEADERS});
  }catch{return NextResponse.json({error:"Não foi possível consultar os dados bancários."},{status:503,headers:OF_HEADERS});}
}
