import { NextRequest, NextResponse } from "next/server";
import { getBillingWebhookById, verifyBillingWebhookAuth, evaluateBillingWebhook } from "@/lib/billing-webhooks";

type Params = Promise<{ id: string }>;

function maskEmail(email: string): string {
  return email.replace(/^(.).*(@.*)$/, "$1***$2");
}

export async function POST(req: NextRequest, { params }: { params: Params }) {
  const { id } = await params;
  const cfg = await getBillingWebhookById(id);
  if (!cfg || !cfg.active) return NextResponse.json({ ok: true }); // 200 sempre — não dar pista de config inválida pra fora

  let body: unknown = null;
  try { body = await req.json(); } catch { body = null; }
  if (!body) return NextResponse.json({ ok: true });

  if (!verifyBillingWebhookAuth(cfg, body, req.headers)) {
    console.error(`[webhook/billing/${cfg.label}] autenticação falhou — requisição rejeitada`);
    return NextResponse.json({ ok: true }); // 200 mesmo assim — não ajuda um atacante a descobrir por tentativa e erro
  }

  const result = await evaluateBillingWebhook(cfg, body);
  if (!result.ok) {
    console.error(`[webhook/billing/${cfg.label}] ${result.error.replace(/[\w.+-]+@[\w.-]+/g, m => maskEmail(m))}`);
  } else {
    console.log(`[webhook/billing/${cfg.label}] ${result.action}${result.email ? ` — ${maskEmail(result.email)}` : ""}${result.detail ? ` (${result.detail})` : ""}`);
  }

  return NextResponse.json({ ok: true });
}
