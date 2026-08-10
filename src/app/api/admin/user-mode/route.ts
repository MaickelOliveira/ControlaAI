import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { updateUser, getUserById } from "@/lib/users";

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

  await updateUser(session.sub, { activeMode: mode });
  const user = await getUserById(session.sub);
  return NextResponse.json({ ok: true, activeMode: user?.activeMode });
}
