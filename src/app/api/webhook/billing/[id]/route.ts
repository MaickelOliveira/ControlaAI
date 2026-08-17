import { NextRequest, NextResponse } from "next/server";
import { getBillingWebhookById, verifyBillingWebhookAuth, evaluateBillingWebhook, recordWebhookAttempt } from "@/lib/billing-webhooks";

type Params = Promise<{ id: string }>;

function maskEmail(email: string): string {
  return email.replace(/^(.).*(@.*)$/, "$1***$2");
}

export async function POST(req: NextRequest, { params }: { params: Params }) {
  const { id } = await params;
  const cfg = await getBillingWebhookById(id);
  if (!cfg) return NextResponse.json({ ok: true }); // 200 sempre — não dar pista de config inválida pra fora

  let body: unknown = null;
  try { body = await req.json(); } catch { body = null; }

  // Grava a tentativa (corpo recebido de verdade) ANTES de qualquer checagem
  // — inclusive quando a integração está desativada ou a autenticação falha
  // — pra dar visibilidade real do que a plataforma de venda está mandando,
  // sem precisar adivinhar o formato exato ou vasculhar log de servidor.
  const authOk = body ? verifyBillingWebhookAuth(cfg, body, req.headers) : false;

  if (!cfg.active) {
    await recordWebhookAttempt(id, { at: new Date().toISOString(), wasActive: false, authOk, body });
    return NextResponse.json({ ok: true });
  }
  if (!body) {
    await recordWebhookAttempt(id, { at: new Date().toISOString(), wasActive: true, authOk: false, body: null });
    return NextResponse.json({ ok: true });
  }
  if (!authOk) {
    console.error(`[webhook/billing/${cfg.label}] autenticação falhou — requisição rejeitada`);
    await recordWebhookAttempt(id, { at: new Date().toISOString(), wasActive: true, authOk: false, body });
    return NextResponse.json({ ok: true }); // 200 mesmo assim — não ajuda um atacante a descobrir por tentativa e erro
  }

  const result = await evaluateBillingWebhook(cfg, body);
  await recordWebhookAttempt(id, { at: new Date().toISOString(), wasActive: true, authOk: true, body, result });
  if (!result.ok) {
    console.error(`[webhook/billing/${cfg.label}] ${result.error.replace(/[\w.+-]+@[\w.-]+/g, m => maskEmail(m))}`);
  } else {
    console.log(`[webhook/billing/${cfg.label}] ${result.action}${result.email ? ` — ${maskEmail(result.email)}` : ""}${result.detail ? ` (${result.detail})` : ""}`);
  }

  return NextResponse.json({ ok: true });
}
