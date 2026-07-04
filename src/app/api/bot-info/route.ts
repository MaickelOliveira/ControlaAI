import { NextResponse } from "next/server";
import { getConfig, saveConfig } from "@/lib/wppconnect";

async function detectBotNumber(): Promise<string> {
  const cfg = getConfig();
  const base = (cfg.wppServer || "").replace(/\/$/, "");
  const token = cfg.wppToken || "";
  const session = cfg.wppSession || "controlaai";
  if (!base || !token) return "";

  // Tenta endpoints comuns do WPPConnect para obter o número conectado
  const endpoints = [
    `${base}/api/${session}/host-device`,
    `${base}/api/${session}/me`,
    `${base}/api/${session}/check-connection-session`,
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(5_000),
      });
      if (!res.ok) continue;
      const data = await res.json() as Record<string, unknown>;
      // Diferentes formatos possíveis de resposta
      const raw =
        (data?.me as Record<string,unknown>)?.id as string ||
        (data?.response as Record<string,unknown>)?.id as string ||
        data?.id as string ||
        data?.phone as string ||
        data?.number as string || "";
      const phone = String(raw).replace(/[^0-9]/g, "");
      if (phone.length >= 8) {
        // Salva para não precisar buscar toda vez
        saveConfig({ ...cfg, wppBotNumber: phone });
        return phone;
      }
    } catch { /* continua tentando */ }
  }
  return "";
}

export async function GET() {
  const cfg = getConfig();
  let botNumber = cfg.wppBotNumber ?? "";

  // Se não configurado manualmente, tenta detectar automaticamente
  if (!botNumber) {
    botNumber = await detectBotNumber();
  }

  return NextResponse.json({ wppBotNumber: botNumber });
}
