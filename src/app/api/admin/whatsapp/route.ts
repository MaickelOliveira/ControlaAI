import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getAdminSession as getSession } from "@/lib/auth";
import { getConfig, saveConfig, type WhatsAppConfig } from "@/lib/whatsapp-config";
import { checkConnection, getQrCode } from "@/lib/whatsapp";
import { createOrRestartInstance } from "@/lib/evolution";
import { sendTemplate } from "@/lib/waba";
import { detectBotNumber } from "@/lib/bot-info";

const isMasked = (v: unknown) => typeof v === "string" && v.startsWith("•");

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const cfg = await getConfig();
  const status = await checkConnection().catch(() => "UNKNOWN");

  return NextResponse.json({
    provider: cfg.provider,
    evolution: {
      server: cfg.evolution?.server ?? "",
      adminKey: cfg.evolution?.adminKey ? "••••••••" : "",
      instanceName: cfg.evolution?.instanceName ?? "zelo",
      hasApiKey: !!cfg.evolution?.instanceApiKey,
    },
    waba: {
      phoneNumberId: cfg.waba?.phoneNumberId ?? "",
      accessToken: cfg.waba?.accessToken ? "••••••••" : "",
      verifyToken: cfg.waba?.verifyToken ?? "",
      appSecret: cfg.waba?.appSecret ? "••••••••" : "",
    },
    geminiApiKey: cfg.geminiApiKey ? "••••••••" : "",
    hasGemini: !!cfg.geminiApiKey,
    appBaseUrl: cfg.appBaseUrl ?? "",
    wppBotNumber: cfg.wppBotNumber ?? "",
    googleClientId: cfg.googleClientId ?? "",
    googleClientSecret: cfg.googleClientSecret ? "••••••••" : "",
    hasGoogleOAuth: !!(cfg.googleClientId && cfg.googleClientSecret),
    connectionStatus: status,
  });
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json();
  const current = await getConfig();
  const updated: WhatsAppConfig = {
    ...current,
    provider: body.provider === "waba" ? "waba" : "evolution",
    evolution: {
      server: body.evolution?.server ?? current.evolution?.server,
      adminKey: !isMasked(body.evolution?.adminKey) && body.evolution?.adminKey ? body.evolution.adminKey : current.evolution?.adminKey,
      instanceName: body.evolution?.instanceName ?? current.evolution?.instanceName ?? "zelo",
      instanceApiKey: current.evolution?.instanceApiKey, // só via ação "connect"
    },
    waba: {
      phoneNumberId: body.waba?.phoneNumberId ?? current.waba?.phoneNumberId,
      accessToken: !isMasked(body.waba?.accessToken) && body.waba?.accessToken ? body.waba.accessToken : current.waba?.accessToken,
      verifyToken: body.waba?.verifyToken ?? current.waba?.verifyToken,
      appSecret: !isMasked(body.waba?.appSecret) && body.waba?.appSecret ? body.waba.appSecret : current.waba?.appSecret,
    },
    geminiApiKey: !isMasked(body.geminiApiKey) && body.geminiApiKey ? body.geminiApiKey : current.geminiApiKey,
    appBaseUrl: body.appBaseUrl ?? current.appBaseUrl,
    wppBotNumber: body.wppBotNumber ?? current.wppBotNumber,
    googleClientId: body.googleClientId !== undefined ? (body.googleClientId || undefined) : current.googleClientId,
    googleClientSecret: !isMasked(body.googleClientSecret) && body.googleClientSecret ? body.googleClientSecret : current.googleClientSecret,
  };
  await saveConfig(updated);
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json();
  const { action } = body;
  const cfg = await getConfig();

  if (action === "connect") {
    // Evolution não assina as requisições que manda pro nosso webhook (ao
    // contrário da Meta) — a única forma de validar que a chamada realmente
    // veio da nossa instância é embutir um segredo próprio na URL que a
    // gente mesmo registra aqui, e conferir esse segredo no webhook.
    const webhookSecret = cfg.evolution?.webhookSecret || randomBytes(24).toString("hex");
    const webhookUrl = `${cfg.appBaseUrl?.replace(/\/$/, "") || ""}/api/webhook/evolution?secret=${webhookSecret}`;
    const result = await createOrRestartInstance(webhookUrl);
    if (!result) return NextResponse.json({ error: "Falha ao conectar. Verifique servidor e admin key." }, { status: 500 });
    await saveConfig({
      ...cfg,
      evolution: { ...cfg.evolution, webhookSecret, ...(result.apiKey ? { instanceApiKey: result.apiKey } : {}) },
    });
    return NextResponse.json({ ok: true, qr: result.qrBase64 });
  }

  if (action === "qr") {
    const qr = await getQrCode();
    return NextResponse.json({ qr });
  }

  if (action === "status") {
    const status = await checkConnection();
    return NextResponse.json({ status });
  }

  if (action === "detect_number") {
    const number = await detectBotNumber();
    return NextResponse.json({ ok: true, wppBotNumber: number || null });
  }

  if (action === "testTemplate") {
    const { template, phone } = body as { template?: string; phone?: string };
    if (!phone) return NextResponse.json({ error: "Informe um telefone" }, { status: 400 });
    const testParams: Record<string, Record<string, string>> = {
      lembrete_pessoal: { lembrete: "Teste de disparo do Zelo 🔔" },
      lembrete_compromisso: { compromisso: "Compromisso de teste", horario: "14:30" },
      cobranca_recorrente: { descricao: "Teste de cobrança", valor: "R$ 99,90", data: new Date().toLocaleDateString("pt-BR") },
    };
    const params = template ? testParams[template] : undefined;
    if (!params) return NextResponse.json({ error: "Template inválido" }, { status: 400 });
    const result = await sendTemplate(phone, template!, "pt_BR", params);
    return NextResponse.json(result);
  }

  return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
}
