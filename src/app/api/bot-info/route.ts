import { NextResponse } from "next/server";
import { getConfig } from "@/lib/whatsapp-config";
import { checkConnection } from "@/lib/whatsapp";
import { detectBotNumber } from "@/lib/bot-info";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "client") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const cfg = await getConfig();
  let botNumber = cfg.wppBotNumber ?? "";
  if (!botNumber) botNumber = await detectBotNumber();
  const status = await checkConnection().catch(() => "UNKNOWN");
  return NextResponse.json({ wppBotNumber: botNumber, connected: status === "CONNECTED" });
}
