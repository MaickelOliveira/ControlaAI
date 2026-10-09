import { NextRequest, NextResponse } from "next/server";
import { COOKIE, SESSION_SECONDS, acceptsCode, allowLogin, issueSession, sameOrigin } from "../../../access";

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({error:"Origem inválida."},{status:403});
  if (!allowLogin()) return NextResponse.json({error:"Aguarde um minuto."},{status:429});
  if (Number(request.headers.get("content-length")) > 2048) return new Response(null,{status:413});
  try {
    const text = await request.text();
    if (text.length > 2048) return new Response(null,{status:413});
    const body = JSON.parse(text);
    if (typeof body?.code !== "string" || !acceptsCode(body.code)) return NextResponse.json({error:"Acesso inválido."},{status:401});
    const response = NextResponse.json({ok:true},{headers:{"Cache-Control":"no-store"}});
    response.cookies.set(COOKIE, issueSession(), {httpOnly:true,secure:true,sameSite:"strict",path:"/",maxAge:SESSION_SECONDS});
    return response;
  } catch { return NextResponse.json({error:"Requisição inválida."},{status:400}); }
}
