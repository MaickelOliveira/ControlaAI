import { NextResponse } from "next/server";
import { getConfig } from "@/lib/wppconnect";

export async function GET() {
  const cfg = getConfig();
  return NextResponse.json({
    wppBotNumber: cfg.wppBotNumber ?? "",
  });
}
