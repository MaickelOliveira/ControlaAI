import { NextRequest, NextResponse } from "next/server";
import { exchangeCode, resolveState } from "@/lib/google-oauth";
import { getGoogleSettingsReturnUrl } from "@/lib/google-return-url";

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
    await exchangeCode(code, state.userId);
    return NextResponse.redirect(returnUrl);
  } catch (e) {
    console.error("[google-callback]", e);
    return NextResponse.redirect(returnUrl);
  }
}
