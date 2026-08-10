import { NextRequest, NextResponse } from "next/server";
import { getAdminSession as getSession } from "@/lib/auth";
import { setAiPaused } from "@/lib/conversations";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const phone = body?.phone as string | undefined;
  const paused = !!body?.paused;
  if (!phone) return NextResponse.json({ error: "phone é obrigatório" }, { status: 400 });

  await setAiPaused(phone, paused);
  return NextResponse.json({ ok: true });
}
