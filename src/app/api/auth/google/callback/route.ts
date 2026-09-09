import { NextRequest, NextResponse } from "next/server";
import { exchangeCode, resolveState } from "@/lib/google-oauth";
import { getConfig } from "@/lib/whatsapp-config";

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");
  const state = resolveState(searchParams.get("state"));
  const error = searchParams.get("error");

  const cfg = await getConfig();
  const base = (cfg.appBaseUrl || process.env.APP_URL || origin).replace(/\/$/, "");

  if (error || !code || !state) {
    return NextResponse.redirect(`${base}/dashboard/configuracoes?googleError=1`);
  }

  const settingsPath = state.locale === "es"
    ? "/es/dashboard/configuracoes"
    : state.locale === "pt-PT"
      ? "/pt/dashboard/configuracoes"
      : "/dashboard/configuracoes";

  try {
    await exchangeCode(code, state.userId);
    return NextResponse.redirect(`${base}${settingsPath}?googleConnected=1`);
  } catch (e) {
    console.error("[google-callback]", e);
    return NextResponse.redirect(`${base}${settingsPath}?googleError=1`);
  }
}
