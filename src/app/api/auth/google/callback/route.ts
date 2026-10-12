import { NextRequest, NextResponse } from "next/server";
import { exchangeCode, resolveState } from "@/lib/google-oauth";
import { getGoogleSettingsReturnUrl } from "@/lib/google-return-url";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = resolveState(searchParams.get("state"));
  const error = searchParams.get("error");

  if (error || !code || !state) {
    return NextResponse.redirect(getGoogleSettingsReturnUrl());
  }

  const returnUrl = getGoogleSettingsReturnUrl(state.locale);

  try {
    // A nonce identifies who started OAuth; the callback browser must still
    // belong to that active client before another account's Google grant is saved.
    const session = await getSession();
    if (!session || session.role !== "client" || session.sub !== state.userId) {
      return NextResponse.redirect(returnUrl);
    }
    await exchangeCode(code, state.userId);
    return NextResponse.redirect(returnUrl);
  } catch {
    console.error("[google-callback] Não foi possível concluir a autorização");
    return NextResponse.redirect(returnUrl);
  }
}
