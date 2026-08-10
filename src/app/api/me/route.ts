import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getUserById } from "@/lib/users";

/** Versão enxuta de /api/dashboard, só com os campos que a sidebar (layout)
 *  precisa pra exibir nome/modo/trial — evita que toda troca de rota do
 *  dashboard pague pelas ~9 queries de saldo/tarefas/gráficos que só a
 *  página principal usa. */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const user = await getUserById(session.sub);
  if (!user) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });

  return NextResponse.json({
    user: { name: user.name, plan: user.plan, status: user.status, activeMode: user.activeMode, trialEndsAt: user.trialEndsAt },
  });
}
