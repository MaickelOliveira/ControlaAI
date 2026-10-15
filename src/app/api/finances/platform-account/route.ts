import {NextResponse} from "next/server";
import {getSessionWithUser} from "@/lib/auth";
import {getAccountsByUser} from "@/lib/accounts";
import {countPlatformFinancesForAccount,movePlatformFinancesToAccount} from "@/lib/finances";
import {runWithCompanyRequest} from "@/lib/company-context";

export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store"};
const validId=(value:unknown):value is string=>typeof value==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

async function handle(mode:unknown,accountId:unknown,apply:boolean){
 const auth=await getSessionWithUser();
 if(!auth||auth.session.role!=="client")return NextResponse.json({error:"Não autorizado"},{status:401,headers});
 if((mode!=="personal"&&mode!=="business")||mode!==auth.user.activeMode||!validId(accountId))return NextResponse.json({error:"Escolha o modo e a conta atuais."},{status:400,headers});
 try{
  const account=(await getAccountsByUser(auth.user.id,mode)).find(item=>item.id===accountId);
  if(!account)return NextResponse.json({error:"Conta não encontrada neste espaço."},{status:404,headers});
  if(account.type!=="bank")return NextResponse.json({error:"Escolha uma conta registrada, não um cartão."},{status:400,headers});
  const count=apply?await movePlatformFinancesToAccount(auth.user.id,mode,accountId):await countPlatformFinancesForAccount(auth.user.id,mode,accountId);
  return NextResponse.json(apply?{moved:count,accountName:account.name}:{count,accountName:account.name},{headers});
 }catch{
  return NextResponse.json({error:"Não foi possível conferir ou organizar os lançamentos. Tente novamente."},{status:503,headers});
 }
}

export async function GET(request:Request){
 return runWithCompanyRequest(async()=>{
  const query=new URL(request.url).searchParams;
  return handle(query.get("mode"),query.get("accountId"),false);
 });
}

export async function POST(request:Request){
 return runWithCompanyRequest(async()=>{
  let body:unknown;
  try{body=await request.json();}catch{return NextResponse.json({error:"Pedido inválido."},{status:400,headers});}
  if(!body||typeof body!=="object"||Array.isArray(body))return NextResponse.json({error:"Pedido inválido."},{status:400,headers});
  const {mode,accountId}=body as Record<string,unknown>;
  return handle(mode,accountId,true);
 });
}
