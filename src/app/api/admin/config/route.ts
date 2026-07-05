import { NextRequest, NextResponse } from "next/server";
import { getAdminSession as getSession } from "@/lib/auth";
import { getConfig, saveConfig } from "@/lib/wppconnect";
import { checkConnection, startSession, getQrCode } from "@/lib/wppconnect";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const cfg = getConfig();
  const status = await checkConnection().catch(() => "UNKNOWN");

  return NextResponse.json({
    wppServer: cfg.wppServer ?? "",
    wppToken: cfg.wppToken ?? "",
    wppSession: cfg.wppSession ?? "controlaai",
    geminiApiKey: cfg.geminiApiKey ?? "",
    appBaseUrl: cfg.appBaseUrl ?? "",
    googleClientId: cfg.googleClientId ?? "",
    googleClientSecret: cfg.googleClientSecret ?? "",
    connectionStatus: status,
  });
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json();
  const current = getConfig();
  saveConfig({
    ...current,
    wppServer: body.wppServer ?? current.wppServer,
    wppToken: body.wppToken ?? current.wppToken,
    wppSession: body.wppSession ?? current.wppSession,
    geminiApiKey: body.geminiApiKey ?? current.geminiApiKey,
    appBaseUrl: body.appBaseUrl ?? current.appBaseUrl,
    googleClientId: body.googleClientId !== undefined ? (body.googleClientId || undefined) : current.googleClientId,
    googleClientSecret: body.googleClientSecret !== undefined ? (body.googleClientSecret || undefined) : current.googleClientSecret,
  });

  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { action } = await req.json();
  const cfg = getConfig();

  if (action === "start") {
    const webhookUrl = `${cfg.appBaseUrl?.replace(/\/$/, "") || ""}/api/webhook/wppconnect`;
    const ok = await startSession(webhookUrl);
    if (!ok) return NextResponse.json({ error: "Falha ao iniciar sessão. Verifique o servidor WPPConnect." }, { status: 500 });

    // Aguarda QR aparecer
    await new Promise(r => setTimeout(r, 3000));
    const qr = await getQrCode();
    return NextResponse.json({ ok: true, qr, webhookUrl });
  }

  if (action === "qr") {
    const qr = await getQrCode();
    return NextResponse.json({ qr });
  }

  if (action === "status") {
    const status = await checkConnection();
    return NextResponse.json({ status });
  }

  return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
}
