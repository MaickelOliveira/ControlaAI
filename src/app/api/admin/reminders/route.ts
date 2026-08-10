import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getAllRemindersByUser, createReminder, deleteReminder, updateReminder } from "@/lib/reminders";
import { getUserById } from "@/lib/users";
import { getPhonesForUser } from "@/lib/wpp-phone-links";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== "client") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    const { searchParams } = new URL(req.url);
    const mode = searchParams.get("mode") as "personal" | "business" | undefined;
    return NextResponse.json(await getAllRemindersByUser(session.sub, mode || undefined));
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "client") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { message, scheduledAt, repeat, mode } = await req.json();
  if (!message || !scheduledAt) return NextResponse.json({ error: "message e scheduledAt obrigatórios" }, { status: 400 });

  const user = await getUserById(session.sub);
  const phoneLinks = user ? await getPhonesForUser(user.id) : [];
  const phone = phoneLinks[0]?.phone || user?.phone || "";

  const r = await createReminder({ userId: session.sub, message, phone, scheduledAt, repeat: repeat || "none", mode: mode || "personal" });
  return NextResponse.json(r, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "client") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id, ...patch } = await req.json();
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  const r = await updateReminder(id, session.sub, patch);
  return r ? NextResponse.json(r) : NextResponse.json({ error: "Não encontrado" }, { status: 404 });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "client") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  await deleteReminder(id, session.sub);
  return NextResponse.json({ ok: true });
}
