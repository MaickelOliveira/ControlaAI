import { NextRequest, NextResponse } from "next/server";
import { getAdminSession as getSession } from "@/lib/auth";
import { loadAdmin, saveAdmin } from "@/lib/admin";
import { checkConnection, startSession, getQrCode } from "@/lib/wppconnect";

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const cfg = loadAdmin();
  const status = await checkConnection().catch(() => "UNKNOWN");

  return NextResponse.json({
    wppServer: cfg.wppServer ?? "",
    wppToken: cfg.wppToken ?? "",
    wppSession: cfg.wppSession ?? "controlaai",
    geminiApiKey: cfg.geminiApiKey ? "••••••••" : "",
    appBaseUrl: cfg.appBaseUrl ?? "",
    connectionStatus: status,
  });
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json();
  const current = loadAdmin();
  saveAdmin({
    ...current,
    wppServer: body.wppServer ?? current.wppServer,
    wppToken: body.wppToken ?? current.wppToken,
    wppSession: body.wppSession ?? current.wppSession,
    geminiApiKey: body.geminiApiKey && !body.geminiApiKey.startsWith("•") ? body.geminiApiKey : current.geminiApiKey,
    appBaseUrl: body.appBaseUrl ?? current.appBaseUrl,
  });
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { action } = await req.json();
  const cfg = loadAdmin();

  if (action === "start") {
    const webhookUrl = `${cfg.appBaseUrl?.replace(/\/$/, "") || ""}/api/webhook/wppconnect`;
    const ok = await startSession(webhookUrl);
    if (!ok) return NextResponse.json({ error: "Falha ao iniciar. Verifique as configurações." }, { status: 500 });
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
