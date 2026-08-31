import { NextRequest, NextResponse } from "next/server";
import { getAdminSession as getSession } from "@/lib/auth";
import { sendAdminSupportMessage } from "@/lib/support-conversations";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const userId = body?.userId as string | undefined;
  const text = (body?.text as string | undefined)?.trim();
  if (!userId || !text) return NextResponse.json({ error: "userId e text são obrigatórios" }, { status: 400 });

  await sendAdminSupportMessage(userId, text);
  return NextResponse.json({ ok: true });
}
