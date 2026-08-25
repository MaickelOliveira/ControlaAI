import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { getBillingWebhooks, createBillingWebhook, BILLING_WEBHOOK_PRESETS } from "@/lib/billing-webhooks";

const isMasked = (v: unknown) => typeof v === "string" && v.startsWith("•");

export async function GET() {
  const session = await getAdminSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const configs = (await getBillingWebhooks()).map(c => ({ ...c, secretValue: c.secretValue ? "••••••••" : "" }));
  return NextResponse.json({ configs, presets: BILLING_WEBHOOK_PRESETS });
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json();
  const { label, secretBodyField, secretHeader, secretValue, emailPath, statusPath, activateValues, deactivateValues, planPath, planMap, localePath, localeMap } = body;
  if (!label || !emailPath || !statusPath) return NextResponse.json({ error: "label, emailPath e statusPath são obrigatórios" }, { status: 400 });

  const cfg = await createBillingWebhook({
    label,
    active: false, // começa desativado — o admin liga depois de testar o mapeamento
    secretBodyField: secretBodyField || undefined,
    secretHeader: secretHeader || undefined,
    secretValue: !isMasked(secretValue) && secretValue ? secretValue : undefined,
    emailPath,
    statusPath,
    activateValues: Array.isArray(activateValues) ? activateValues : [],
    deactivateValues: Array.isArray(deactivateValues) ? deactivateValues : [],
    planPath: planPath || undefined,
    planMap: planMap && typeof planMap === "object" ? planMap : undefined,
    localePath: localePath || undefined,
    localeMap: localeMap && typeof localeMap === "object" ? localeMap : undefined,
  });
  return NextResponse.json(cfg, { status: 201 });
}
