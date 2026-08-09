import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { getBillingWebhookById, updateBillingWebhook, deleteBillingWebhook, evaluateBillingWebhook } from "@/lib/billing-webhooks";

type Params = Promise<{ id: string }>;

const isMasked = (v: unknown) => typeof v === "string" && v.startsWith("•");

export async function PATCH(req: NextRequest, { params }: { params: Params }) {
  const session = await getAdminSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  // ação especial: testa o mapeamento contra um payload colado, sem
  // mexer em nenhum cliente de verdade (dry run)
  if (body.action === "test") {
    const cfg = getBillingWebhookById(id);
    if (!cfg) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
    let payload: unknown;
    try { payload = JSON.parse(body.payload); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }
    const result = evaluateBillingWebhook(cfg, payload, true);
    return NextResponse.json(result);
  }

  const { secretValue, ...rest } = body;
  const patch = { ...rest, ...(secretValue !== undefined ? { secretValue: !isMasked(secretValue) && secretValue ? secretValue : undefined } : {}) };
  const cfg = updateBillingWebhook(id, patch);
  return cfg ? NextResponse.json(cfg) : NextResponse.json({ error: "Não encontrado" }, { status: 404 });
}

export async function DELETE(_req: NextRequest, { params }: { params: Params }) {
  const session = await getAdminSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;
  deleteBillingWebhook(id);
  return NextResponse.json({ ok: true });
}
