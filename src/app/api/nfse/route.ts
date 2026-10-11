import { NextResponse } from "next/server";
import { getSessionWithUser } from "@/lib/auth";
import { isSameOrigin } from "@/lib/request-origin";
import { checkRateLimit } from "@/lib/rate-limit";
import { boundedFiscalRequest } from "@/lib/nfse-request";
import { fiscalOverview, saveFiscalProfile, saveFiscalService, createFiscalDraft, archiveFiscalRecord } from "@/lib/nfse";
const headers = { "Cache-Control": "private, no-store" };
async function owner() { const auth = await getSessionWithUser(); return auth?.session.role === "client" && auth.user.plan === "business" && auth.user.activeMode === "business" && auth.user.locale === "pt-BR" ? auth : null; }
export async function GET() {
 const auth = await owner(); if (!auth) return NextResponse.json({ error: "Acesse o modo Empresa de uma conta brasileira com plano empresarial." }, { status: 403, headers });
 try { return NextResponse.json(await fiscalOverview(auth.user.id), { headers }); }
 catch { return NextResponse.json({ error: "Não foi possível carregar as notas fiscais desta empresa." }, { status: 503, headers }); }
}
export async function POST(request: Request) {
 const auth = await owner(); if (!auth) return NextResponse.json({ error: "Não autorizado para esta empresa." }, { status: 403, headers });
 if (!isSameOrigin(request, process.env.OPEN_FINANCE_APP_ORIGIN || process.env.NEXT_PUBLIC_APP_URL)) return NextResponse.json({ error: "Origem não autorizada." }, { status: 403, headers });
 if (!await checkRateLimit(`nfse:${auth.user.id}`, 30, 60_000)) return NextResponse.json({ error: "Aguarde um pouco antes de continuar." }, { status: 429, headers });
 let body: Record<string, unknown>;
 try { body = await (await boundedFiscalRequest(request, 32_000)).json(); if (!body || typeof body !== "object" || Array.isArray(body)) throw Error(); } catch { return NextResponse.json({ error: "Dados inválidos ou acima do tamanho permitido." }, { status: 400, headers }); }
 try {
  if (body.action === "profile") await saveFiscalProfile(auth.user.id, body.profile);
  else if (body.action === "service") await saveFiscalService(auth.user.id, body.service, typeof body.id === "string" ? body.id : undefined);
  else if (body.action === "draft") return NextResponse.json(await createFiscalDraft(auth.user.id, body.draft, "web", auth.user.id), { status: 201, headers });
  else if (body.action === "archive" && (body.kind === "service" || body.kind === "draft") && typeof body.id === "string") await archiveFiscalRecord(auth.user.id, body.kind, body.id);
  else return NextResponse.json({ error: "Ação fiscal não disponível. Nenhuma nota foi emitida." }, { status: 400, headers });
  return NextResponse.json({ ok: true }, { headers });
 } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível concluir esta ação fiscal." }, { status: 400, headers }); }
}
