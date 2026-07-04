import { NextRequest, NextResponse } from "next/server";
import { getAdminSession as getSession } from "@/lib/auth";
import { loadAdmin, saveAdmin } from "@/lib/admin";
import { checkConnection, startSession, getQrCode, saveConfig, getConfig, generateAndSaveToken } from "@/lib/wppconnect";
import { detectBotNumber } from "@/app/api/bot-info/route";

/** Sincroniza admin.json → config.json para que o bot use os mesmos dados */
function syncToConfig() {
  const adm = loadAdmin();
  const cur = getConfig();
  saveConfig({
    ...cur,
    wppServer:    adm.wppServer    ?? cur.wppServer,
    wppSecretKey: adm.wppSecretKey ?? cur.wppSecretKey,
    wppToken:     adm.wppToken     ?? cur.wppToken,
    wppSession:   adm.wppSession   ?? cur.wppSession,
    geminiApiKey: adm.geminiApiKey ?? cur.geminiApiKey,
    appBaseUrl:   adm.appBaseUrl   ?? cur.appBaseUrl,
    wppBotNumber: adm.wppBotNumber ?? cur.wppBotNumber,
  });
}

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const cfg = loadAdmin();
  const status = await checkConnection().catch(() => "UNKNOWN");

  return NextResponse.json({
    wppServer: cfg.wppServer ?? "",
    wppSecretKey: cfg.wppSecretKey ? "••••••••" : "",
    wppToken: cfg.wppToken ? cfg.wppToken.slice(0, 20) + "..." : "",
    hasToken: !!cfg.wppToken,
    wppSession: cfg.wppSession ?? "controlaai",
    geminiApiKey: cfg.geminiApiKey ? "••••••••" : "",
    hasGemini: !!cfg.geminiApiKey,
    appBaseUrl: cfg.appBaseUrl ?? "",
    wppBotNumber: cfg.wppBotNumber ?? "",
    connectionStatus: status,
  });
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json();
  const current = loadAdmin();
  const updated = {
    ...current,
    wppServer:    body.wppServer    ?? current.wppServer,
    wppSecretKey: body.wppSecretKey && !body.wppSecretKey.startsWith("•") ? body.wppSecretKey : current.wppSecretKey,
    wppSession:   body.wppSession   ?? current.wppSession,
    geminiApiKey: body.geminiApiKey && !body.geminiApiKey.startsWith("•") ? body.geminiApiKey : current.geminiApiKey,
    appBaseUrl:   body.appBaseUrl   ?? current.appBaseUrl,
    wppBotNumber: body.wppBotNumber ?? current.wppBotNumber,
    // wppToken não é aceito do body — só via generate_token
  };
  saveAdmin(updated);
  syncToConfig();
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json();
  const { action } = body;

  if (action === "generate_token") {
    const isMasked = (v: unknown) => typeof v === "string" && v.startsWith("•");

    // Se a secret key no body estiver mascarada, forçar redigitação
    if (isMasked(body.wppSecretKey)) {
      return NextResponse.json({ error: "Redigite a Secret Key no campo acima e clique em Gerar Token novamente. O campo está mostrando pontos (••••) mas precisamos do valor real." }, { status: 400 });
    }

    const wppSecretKey = body.wppSecretKey as string;
    const wppServer    = !isMasked(body.wppServer) ? (body.wppServer as string) : undefined;
    const wppSession   = !isMasked(body.wppSession) ? (body.wppSession as string) : undefined;

    if (!wppSecretKey) {
      return NextResponse.json({ error: "Preencha a Secret Key antes de gerar o token." }, { status: 400 });
    }

    // Limpa valor corrompido do admin.json e salva o valor real
    const adm = loadAdmin();
    const toSave = {
      ...adm,
      wppSecretKey,
      ...(wppServer  ? { wppServer }  : {}),
      ...(wppSession ? { wppSession } : {}),
    };
    saveAdmin(toSave);
    syncToConfig();

    const result = await generateAndSaveToken({ wppServer, wppSecretKey, wppSession });
    if (!result || result.error) {
      return NextResponse.json({ error: result?.error || "Falha ao gerar token", url: result?.url }, { status: 500 });
    }
    saveAdmin({ ...toSave, wppToken: result.token });
    return NextResponse.json({ ok: true, token: result.token.slice(0, 20) + "..." });
  }

  if (action === "start") {
    syncToConfig();
    const cfg = loadAdmin();
    const webhookUrl = `${cfg.appBaseUrl?.replace(/\/$/, "") || ""}/api/webhook/wppconnect`;
    const ok = await startSession(webhookUrl);
    if (!ok) return NextResponse.json({ error: "Falha ao iniciar. Verifique as configurações e se o token foi gerado." }, { status: 500 });
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

  if (action === "detect_number") {
    const number = await detectBotNumber();
    return NextResponse.json({ ok: true, wppBotNumber: number || null });
  }

  return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
}
