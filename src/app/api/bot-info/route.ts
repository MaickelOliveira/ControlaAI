import { NextResponse } from "next/server";
import { getConfig, saveConfig } from "@/lib/whatsapp-config";
import { getInstancePhone } from "@/lib/evolution";
import { checkConnection } from "@/lib/whatsapp";

export async function detectBotNumber(): Promise<string> {
  const cfg = getConfig();

  // WABA: não tem endpoint de "meu número" sem permissões extras — o admin
  // informa o Phone Number ID e o número diretamente na tela de config.
  if (cfg.provider === "waba") return cfg.wppBotNumber ?? "";

  const phone = await getInstancePhone();
  if (phone) {
    saveConfig({ ...cfg, wppBotNumber: phone });
    return phone;
  }
  return "";
}

export async function GET() {
  const cfg = getConfig();
  let botNumber = cfg.wppBotNumber ?? "";
  if (!botNumber) botNumber = await detectBotNumber();
  const status = await checkConnection().catch(() => "UNKNOWN");
  return NextResponse.json({ wppBotNumber: botNumber, connected: status === "CONNECTED" });
}
