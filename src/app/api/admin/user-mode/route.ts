import {cookies} from "next/headers";
import {WORKSPACE_MODE_COOKIE,workspaceModeCookieValue} from "@/lib/workspace-mode";
import { NextRequest, NextResponse } from "next/server";
import { getSession, invalidateUserAuthCache } from "@/lib/auth";
import { updateUser } from "@/lib/users";

// Só troca o modo (pessoal/empresa) daqui. Vincular número de WhatsApp tem
// que passar SEMPRE pelo fluxo de código de verificação (awaiting_wpp_link_info
// em message-handler.ts) — aceitar wppPhone direto aqui deixava qualquer
// cliente logado colocar o número de qualquer pessoa na própria conta, sem
// confirmação nenhuma do dono real do número.
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "client") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { mode } = await req.json();
  if (mode !== "personal" && mode !== "business") return NextResponse.json({ error: "mode inválido" }, { status: 400 });

  const user=await updateUser(session.sub, { activeMode: mode });
  invalidateUserAuthCache(session.sub);
  if(!user||user.activeMode!==mode)return NextResponse.json({error:"Não foi possível salvar o modo."},{status:503});
  (await cookies()).set(WORKSPACE_MODE_COOKIE,workspaceModeCookieValue(session.sub,mode),{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",maxAge:60*60*24*7});
  return NextResponse.json({ ok: true, activeMode: user?.activeMode });
}
