import { NextRequest, NextResponse } from "next/server";
import { exchangeCode } from "@/lib/google-oauth";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const userId = searchParams.get("state");
  const error = searchParams.get("error");

  if (error || !code || !userId) {
    return NextResponse.redirect(
      `${process.env.APP_URL}/dashboard/configuracoes?googleError=1`
    );
  }

  try {
    await exchangeCode(code, userId);
    return NextResponse.redirect(
      `${process.env.APP_URL}/dashboard/configuracoes?googleConnected=1`
    );
  } catch (e) {
    console.error("[google-callback]", e);
    return NextResponse.redirect(
      `${process.env.APP_URL}/dashboard/configuracoes?googleError=1`
    );
  }
}
