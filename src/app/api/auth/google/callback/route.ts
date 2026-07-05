import { NextRequest, NextResponse } from "next/server";
import { exchangeCode } from "@/lib/google-oauth";
import { getConfig } from "@/lib/wppconnect";

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");
  const userId = searchParams.get("state");
  const error = searchParams.get("error");

  const cfg = getConfig();
  const base = (cfg.appBaseUrl || process.env.APP_URL || origin).replace(/\/$/, "");

  if (error || !code || !userId) {
    return NextResponse.redirect(`${base}/dashboard/configuracoes?googleError=1`);
  }

  try {
    await exchangeCode(code, userId);
    return NextResponse.redirect(`${base}/dashboard/configuracoes?googleConnected=1`);
  } catch (e) {
    console.error("[google-callback]", e);
    return NextResponse.redirect(`${base}/dashboard/configuracoes?googleError=1`);
  }
}
