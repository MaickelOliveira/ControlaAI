import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { revokeTokens } from "@/lib/google-oauth";

export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  await revokeTokens(session.sub);
  return NextResponse.json({ ok: true });
}
