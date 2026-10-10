import { NextResponse } from "next/server";
import { openFinanceRequestScope, openFinanceRpc, OF_HEADERS } from "@/lib/open-finance-http";
import { polpObject, polpProductionRequest, polpUuid } from "@/lib/polp-production";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const scope = await openFinanceRequestScope(request, true);
  if (scope instanceof Response) return scope;
  try {
    const id = polpUuid((await context.params).id);
    const connection = polpObject(await openFinanceRpc(scope, "zelo_of_connection", { p_id: id }));
    if (connection.status === "revoked") return NextResponse.json({ ok: true }, { headers: OF_HEADERS });
    // Stop local imports before the provider call; failure remains revoking and can retry.
    await openFinanceRpc(scope, "zelo_of_set_status", { p_id: id, p_status: "revoking", p_provider_status: null });
    await polpProductionRequest(`/consents/${polpUuid(connection.external_consent_id)}`, "DELETE");
    await openFinanceRpc(scope, "zelo_of_set_status", { p_id: id, p_status: "revoked", p_provider_status: "REVOKED" });
    return NextResponse.json({ ok: true }, { headers: OF_HEADERS });
  } catch { return NextResponse.json({ error: "Não foi possível confirmar o cancelamento no banco. Tente novamente. As atualizações locais foram interrompidas se o pedido já foi registrado." }, { status: 503, headers: OF_HEADERS }); }
}
