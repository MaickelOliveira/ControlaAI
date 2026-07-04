import { NextResponse } from "next/server";
import { getConfig, saveConfig } from "@/lib/wppconnect";
import { loadAdmin, saveAdmin } from "@/lib/admin";

type WppResponse = Record<string, unknown>;

function extractPhone(data: WppResponse): string {
  const r = (data?.response ?? {}) as WppResponse;
  const wid = (r?.wid ?? data?.wid ?? {}) as WppResponse;

  // Formatos WPPConnect: response.wid.user / response.wid._serialized / response.id / id / phone
  const candidates = [
    wid?.user,
    String(wid?._serialized ?? "").split("@")[0],
    r?.id,
    r?.phone,
    r?.number,
    (data?.me as WppResponse)?.id,
    data?.id,
    data?.phone,
    data?.number,
  ];

  for (const c of candidates) {
    const phone = String(c ?? "").replace(/[^0-9]/g, "");
    if (phone.length >= 8) return phone;
  }
  return "";
}

export async function detectBotNumber(): Promise<string> {
  const cfg = getConfig();
  const base = (cfg.wppServer || "").replace(/\/$/, "");
  const token = cfg.wppToken || "";
  const session = cfg.wppSession || "controlaai";
  if (!base || !token) return "";

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
      const data = await res.json() as WppResponse;
      const phone = extractPhone(data);
      if (phone) {
        saveConfig({ ...cfg, wppBotNumber: phone });
        const adm = loadAdmin();
        saveAdmin({ ...adm, wppBotNumber: phone });
        return phone;
      }
    } catch { /* continua tentando */ }
  }
  return "";
}

export async function GET() {
  const cfg = getConfig();
  let botNumber = cfg.wppBotNumber ?? "";
  if (!botNumber) botNumber = await detectBotNumber();
  return NextResponse.json({ wppBotNumber: botNumber });
}
