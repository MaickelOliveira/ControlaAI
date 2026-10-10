import { NextResponse } from "next/server";
import { getOpenFinanceOwner } from "@/lib/open-finance-owner";
import { getOpenFinanceAccess } from "@/lib/open-finance-access";
import { openFinanceRpc, OF_HEADERS } from "@/lib/open-finance-http";
import { parseBankWebhook, verifyBankWebhook } from "@/lib/open-finance-webhook";
import { polpObject } from "@/lib/polp-production";
import { readBankBody } from "@/lib/open-finance-body";

export async function POST(request:Request) {
  if(process.env.OPEN_FINANCE_SYNC_ENABLED!=="true")return NextResponse.json({error:"Não disponível"},{status:404,headers:OF_HEADERS});
  const signature=request.headers.get("x-webhook-signature"), secret=process.env.POLP_WEBHOOK_SIGNING_SECRET;
  if(!signature || !secret)return NextResponse.json({error:"Não autorizado"},{status:401,headers:OF_HEADERS});
  let raw:Buffer;
  try{raw=await readBankBody(request,16_384);}catch{return NextResponse.json({error:"Corpo inválido"},{status:413,headers:OF_HEADERS});}
  if(!verifyBankWebhook(raw,signature,secret))return NextResponse.json({error:"Não autorizado"},{status:401,headers:OF_HEADERS});
  let job;
  try{job=parseBankWebhook(JSON.parse(raw.toString("utf8")));}catch{return NextResponse.json({error:"Evento inválido"},{status:400,headers:OF_HEADERS});}
  try {
    const owner=await getOpenFinanceOwner();
    if(!owner)throw new Error("OF_OWNER_UNAVAILABLE");
    const scope=await getOpenFinanceAccess(owner,"personal");
    if(!scope)throw new Error("OF_ACCESS_DENIED");
    const target=await openFinanceRpc(scope,"zelo_of_webhook_target",{p_reference:job.external_resource_id,p_family:job.kind==="catalog"||job.kind==="consent"?"consents":job.family});
    if(!target)throw new Error("OF_TARGET_PENDING");
    const connection=polpObject(target);
    if(connection.status==="revoked"||connection.status==="revoking")return NextResponse.json({ok:true},{status:202,headers:OF_HEADERS});
    const current=await getOpenFinanceAccess(owner,String(connection.mode));
    if(!current)throw new Error("OF_ACCESS_DENIED");
    await openFinanceRpc(current,"zelo_of_enqueue",{p_connection:connection.id,p_job:job});
    return NextResponse.json({ok:true},{status:202,headers:OF_HEADERS});
  }catch{return NextResponse.json({error:"Atualização não salva; repetir entrega"},{status:503,headers:OF_HEADERS});}
}
