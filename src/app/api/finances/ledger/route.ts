import {NextResponse} from "next/server";
import {getSessionWithUser} from "@/lib/auth";
import {getFinancesInRange,getAllTimeBalance} from "@/lib/finances";
import {getOpenFinanceAccess} from "@/lib/open-finance-access";
import {bankPeriod} from "@/lib/open-finance-report";
import {readBankLedger} from "@/lib/finance-ledger-storage";
import {createFinanceLedger,ledgerBalance} from "@/lib/finance-ledger";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store"};
export async function GET(request:Request){
  const auth=await getSessionWithUser();
  if(!auth||auth.session.role!=="client")return NextResponse.json({error:"Não autorizado"},{status:401,headers});
  const query=new URL(request.url).searchParams,mode=query.get("mode")??auth.user.activeMode;
  if(mode!=="personal"&&mode!=="business")return NextResponse.json({error:"Escolha Pessoal ou Empresa."},{status:400,headers});
  let period;try{
    const from=bankPeriod(query.get("from"),query.get("from")).from,to=bankPeriod(query.get("to"),query.get("to")).to;
    if(to<from)throw Error("OF_PERIOD_INVALID");period={from,to};
  }catch{return NextResponse.json({error:"Escolha um período válido."},{status:400,headers});}
  try{
    const scope=await getOpenFinanceAccess(auth.user,mode,{throwOnStorageError:true});
    if(scope){try{bankPeriod(period.from,period.to);}catch{return NextResponse.json({error:"Para incluir os bancos, escolha um período de até 366 dias."},{status:400,headers});}}
    const [records,totalBalance,bank]=await Promise.all([getFinancesInRange(auth.user.id,mode,period.from,period.to),getAllTimeBalance(auth.user.id,mode),scope?readBankLedger(scope,period):null]);
    const finances=createFinanceLedger(records.map(({id,type,amount,category,description,date,mode,source,status,createdAt})=>({id,type,amount,category,description,date,mode,source,status,createdAt})),bank?.report.movements??[],mode);
    return NextResponse.json({finances,balance:ledgerBalance(finances),totalBalance,bank},{headers});
  }catch{
    return NextResponse.json({error:"Não foi possível atualizar o extrato completo. Tente um período menor ou aguarde uma nova tentativa."},{status:503,headers});
  }
}
