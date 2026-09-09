import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getAuthUrl } from "@/lib/google-oauth";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const requested = new URL(req.url).searchParams.get("locale");
  const locale = requested === "es" ? "es" : requested === "pt-PT" ? "pt-PT" : "pt-BR";
  const url = await getAuthUrl(session.sub, locale);
  return NextResponse.redirect(url);
}
