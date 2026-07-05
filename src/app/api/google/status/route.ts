import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isConnected, getConnectedEmail } from "@/lib/google-oauth";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const connected = isConnected(session.sub);
  if (!connected) return NextResponse.json({ connected: false });

  const email = await getConnectedEmail(session.sub);
  return NextResponse.json({ connected: true, email });
}
