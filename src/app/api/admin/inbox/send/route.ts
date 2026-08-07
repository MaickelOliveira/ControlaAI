import { NextRequest, NextResponse } from "next/server";
import { getAdminSession as getSession } from "@/lib/auth";
import { sendText } from "@/lib/whatsapp";
import { setAiPaused } from "@/lib/conversations";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const phone = body?.phone as string | undefined;
  const content = (body?.content as string | undefined)?.trim();
  if (!phone || !content) return NextResponse.json({ error: "phone e content são obrigatórios" }, { status: 400 });

  const ok = await sendText(phone, content);
  if (!ok) return NextResponse.json({ error: "Falha ao enviar mensagem" }, { status: 500 });

  // Resposta manual pelo Inbox pausa a IA — evita que ela responda por cima
  // do que o atendente acabou de mandar.
  setAiPaused(phone, true);
  return NextResponse.json({ ok: true });
}
