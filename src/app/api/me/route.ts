import { NextResponse } from "next/server";
import { getSessionWithUser } from "@/lib/auth";

/** Versão enxuta de /api/dashboard, só com os campos que a sidebar (layout)
 *  precisa pra exibir nome/modo/trial — evita que toda troca de rota do
 *  dashboard pague pelas ~9 queries de saldo/tarefas/gráficos que só a
 *  página principal usa. */
export async function GET() {
  const auth = await getSessionWithUser();
  if (!auth) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { user } = auth;

  return NextResponse.json({
    user: { name: user.name, plan: user.plan, status: user.status, activeMode: user.activeMode, trialEndsAt: user.trialEndsAt },
  });
}
