import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getAdminSession as getSession } from "@/lib/auth";
import { getConfig, saveConfig, type WhatsAppConfig } from "@/lib/whatsapp-config";
import {
  checkConnection,
  getQrCode,
  languageCodeFor,
  localizedTemplateName,
  localizedTemplateParams,
  type WhatsAppTemplateBase,
} from "@/lib/whatsapp";
import { createOrRestartInstance } from "@/lib/evolution";
import { sendTemplate } from "@/lib/waba";
import { detectBotNumber } from "@/lib/bot-info";
import { addMessage } from "@/lib/conversations";

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
    const { template, phone, locale } = body as { template?: WhatsAppTemplateBase; phone?: string; locale?: "pt-BR" | "es" };
    if (!phone) return NextResponse.json({ error: "Informe um telefone" }, { status: 400 });
    const safeLocale = locale === "es" ? "es" : "pt-BR";
    const spanish = safeLocale === "es";
    const testParams: Record<WhatsAppTemplateBase, Record<string, string>> = {
      lembrete_assessor: {
        remetente: spanish ? "Equipo Zelo" : "Equipe Zelo",
        lembrete: spanish ? "Mensaje de prueba de Zelo" : "Mensagem de teste do Zelo",
      },
      lbte_empresarial: { lembrete: spanish ? "Revisar los compromisos de la empresa" : "Revisar os compromissos da empresa" },
      lbt_pessoal: { texto: spanish ? "Prueba de envío de Zelo 🔔" : "Teste de disparo do Zelo 🔔" },
      lembrete_compromisso: { compromisso: spanish ? "Evento de prueba" : "Compromisso de teste", horario: "14:30" },
      lembrete_compromisso15: { compromisso: spanish ? "Evento de prueba" : "Compromisso de teste", horario: "14:30" },
      cbr_recorrente: {
        descricao: spanish ? "Cobro de prueba" : "Teste de cobrança",
        valor: spanish ? "USD 99.90" : "R$ 99,90",
        data: new Date().toLocaleDateString(spanish ? "es" : "pt-BR"),
      },
      boas_vindas_cadastro2: {},
    };
    const params = template ? testParams[template] : undefined;
    if (!params) return NextResponse.json({ error: "Template inválido" }, { status: 400 });
    const templateName = localizedTemplateName(template!, safeLocale);
    const localizedParams = localizedTemplateParams(template!, params, safeLocale);
    const languageCode = languageCodeFor(safeLocale);
    const result = await sendTemplate(phone, templateName, languageCode, localizedParams);
    // Esse envio chama waba.sendTemplate direto (não passa pela fachada
    // src/lib/whatsapp.ts), então precisa logar no Inbox manualmente — senão
    // a mensagem sai pro WhatsApp do destinatário mas nunca aparece na
    // conversa dele no /admin/inbox.
    if (result.ok) {
      const preview = `🧪 Teste de template "${templateName}" (${languageCode})\n${Object.entries(localizedParams).map(([k, v]) => `${k}: ${v}`).join("\n")}`;
      await addMessage(phone, { role: "assistant", content: preview, ts: Date.now() });
    }
    return NextResponse.json({ ...result, templateName, languageCode });
  }

  return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
}
