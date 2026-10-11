import { NextResponse } from "next/server";
import { openFinanceRequestScope, OF_HEADERS } from "@/lib/open-finance-http";
import { disconnectBank } from "@/lib/open-finance-connections";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const scope = await openFinanceRequestScope(request, true);
  if (scope instanceof Response) return scope;
  try {
    await disconnectBank(scope,(await context.params).id);
    return NextResponse.json({ ok: true }, { headers: OF_HEADERS });
  } catch { return NextResponse.json({ error: "Não foi possível confirmar o cancelamento no banco. Tente novamente. As atualizações locais foram interrompidas se o pedido já foi registrado." }, { status: 503, headers: OF_HEADERS }); }
}
