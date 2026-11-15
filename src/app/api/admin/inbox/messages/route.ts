import { NextRequest, NextResponse } from "next/server";
import { getAdminSession as getSession } from "@/lib/auth";
import { deleteInboxMessage, getHistory, inboxMessageId, markAsRead } from "@/lib/conversations";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const phone = req.nextUrl.searchParams.get("phone");
  if (!phone) return NextResponse.json({ error: "Telefone não informado" }, { status: 400 });

  const messages = await getHistory(phone);
  await markAsRead(phone);
  return NextResponse.json({ messages: messages.map(message => ({
    role: message.role,
    content: message.content,
    ts: message.ts,
    type: message.type,
    ...(message.type === "image" && message.mediaUrl?.startsWith("/api/admin/inbox/image?") ? { mediaUrl: message.mediaUrl } : {}),
    ...(message.role === "assistant" ? { id: inboxMessageId(message) } : {}),
  })) });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const phone = typeof body?.phone === "string" ? body.phone : "";
  const id = typeof body?.id === "string" ? body.id : "";
  if (!/^\d{8,20}$/.test(phone) || !/^[0-9a-f]{64}$/.test(id)) {
    return NextResponse.json({ error: "Mensagem inválida." }, { status: 400 });
  }
  try {
    await deleteInboxMessage(phone, id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Não foi possível apagar. Tente novamente." }, { status: 503 });
  }
}
