import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getAuthUrl } from "@/lib/google-oauth";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const url = getAuthUrl(session.sub);
  return NextResponse.redirect(url);
}
