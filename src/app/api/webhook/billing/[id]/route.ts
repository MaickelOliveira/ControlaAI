import { NextRequest, NextResponse } from "next/server";
import { getBillingWebhookById, verifyBillingWebhookAuth, evaluateBillingWebhook, recordWebhookAttempt } from "@/lib/billing-webhooks";
import { readBankBody } from "@/lib/open-finance-body";

type Params = Promise<{ id: string }>;

export async function POST(req: NextRequest, { params }: { params: Params }) {
  const { id } = await params;
  const cfg = await getBillingWebhookById(id);
  if (!cfg) return NextResponse.json({ ok: true }); // 200 sempre — não dar pista de config inválida pra fora

  let body: unknown = null;
  let rawBody: string;
  try { rawBody = (await readBankBody(req, 1_048_576)).toString("utf8"); }
  catch { return NextResponse.json({ error: "Corpo inválido ou grande demais" }, { status: 413 }); }
  try { body = JSON.parse(rawBody); } catch { body = null; }

  // Grava os campos diagnósticos permitidos ANTES de qualquer checagem
  // — inclusive quando a integração está desativada ou a autenticação falha
  // — pra dar visibilidade real do que a plataforma de venda está mandando,
  // sem precisar adivinhar o formato exato ou vasculhar log de servidor.
  const authOk = body ? verifyBillingWebhookAuth(cfg, body, req.headers) : false;

  if (!cfg.active) {
    await recordWebhookAttempt(id, { at: new Date().toISOString(), wasActive: false, authOk, body }, cfg);
    return NextResponse.json({ ok: true });
  }
  if (!body) {
    await recordWebhookAttempt(id, { at: new Date().toISOString(), wasActive: true, authOk: false, body: null }, cfg);
    return NextResponse.json({ ok: true });
  }
  if (!authOk) {
    console.error("[webhook/billing/] autenticação falhou — requisição rejeitada");
    await recordWebhookAttempt(id, { at: new Date().toISOString(), wasActive: true, authOk: false, body }, cfg);
    return NextResponse.json({ ok: true }); // 200 mesmo assim — não ajuda um atacante a descobrir por tentativa e erro
  }

  const result = await evaluateBillingWebhook(cfg, body);
  await recordWebhookAttempt(id, { at: new Date().toISOString(), wasActive: true, authOk: true, body, result }, cfg);
  if (!result.ok) {
    console.error("[webhook/billing/]");
  } else {
    console.log("[webhook/billing] Evento processado");
  }

  // Falha ao gravar no banco: responde 503 para a plataforma de venda reenviar
  // o evento, em vez de dar 200 e deixar um reembolso sem efeito.
  if (!result.ok && result.retryable) return NextResponse.json({ ok: false }, { status: 503 });
  return NextResponse.json({ ok: true });
}
