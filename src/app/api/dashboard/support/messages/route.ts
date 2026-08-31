import { NextRequest, NextResponse } from "next/server";
import { getSessionWithUser } from "@/lib/auth";
import { getSupportThread, markSupportReadByUser, postUserSupportMessage } from "@/lib/support-conversations";

export async function GET() {
  const auth = await getSessionWithUser();
  if (!auth) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const thread = await getSupportThread(auth.user.id);
  await markSupportReadByUser(auth.user.id);
  return NextResponse.json(thread);
}

export async function POST(req: NextRequest) {
  const auth = await getSessionWithUser();
  if (!auth) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const text = (body?.text as string | undefined)?.trim();
  if (!text) return NextResponse.json({ error: "text é obrigatório" }, { status: 400 });

  const systemReplies = await postUserSupportMessage(auth.user.id, text);
  return NextResponse.json({ ok: true, systemReplies });
}
