import { NextResponse } from "next/server";
import { openFinanceRequestScope, OF_HEADERS } from "@/lib/open-finance-http";
import { refreshProductionConsent } from "@/lib/open-finance-consent";
import { enqueueConsentCheck } from "@/lib/open-finance-sync";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const scope = await openFinanceRequestScope(request, true);
  if (scope instanceof Response) return scope;
  try {
    const result = await refreshProductionConsent(scope, (await context.params).id);
    if(process.env.OPEN_FINANCE_SYNC_ENABLED==="true" && result.status!=="revoked" && result.status!=="revoking")await enqueueConsentCheck(scope,result.id);
    return NextResponse.json(result, { headers: OF_HEADERS });
  } catch {
    return NextResponse.json({ error: "Não foi possível verificar a conexão. Tente novamente em alguns instantes." }, { status: 503, headers: OF_HEADERS });
  }
}
