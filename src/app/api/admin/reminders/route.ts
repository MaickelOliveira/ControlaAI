import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getAllRemindersByUser, createReminder, deleteReminder, updateReminder, type Reminder, type ReminderRecipientType } from "@/lib/reminders";
import { getPhonesForUser } from "@/lib/wpp-phone-links";

const RECIPIENT_TYPES: ReminderRecipientType[] = ["self", "customer", "employee", "other"];
const REPEAT_TYPES = ["none", "daily", "weekly", "monthly"] as const;

function normalizePhone(value: unknown): string {
  return typeof value === "string" ? value.replace(/\D/g, "") : "";
}

async function resolveRecipient(
  userId: string,
  rawType: unknown,
  rawPhone: unknown,
  rawName: unknown,
): Promise<{ phone: string; recipientType: ReminderRecipientType; recipientName?: string } | { error: string }> {
  const recipientType = RECIPIENT_TYPES.includes(rawType as ReminderRecipientType)
    ? rawType as ReminderRecipientType
    : "self";
  const requestedPhone = normalizePhone(rawPhone);
  const requestedName = typeof rawName === "string" ? rawName.trim().slice(0, 80) : "";

  if (recipientType === "self") {
    const links = await getPhonesForUser(userId);
    if (links.length === 0) return { error: "Vincule um número do WhatsApp antes de criar o lembrete" };

    // Com mais de um número, a API exige escolha explícita. Isso impede que
    // uma tela antiga ou uma chamada incompleta use silenciosamente o primeiro.
    const selected = requestedPhone
      ? links.find(link => normalizePhone(link.phone) === requestedPhone)
      : links.length === 1 ? links[0] : undefined;
    if (!selected) return { error: "Selecione qual número vinculado deve receber o lembrete" };

    return {
      phone: selected.phone,
      recipientType,
      recipientName: requestedName || selected.name || selected.relation,
    };
  }

  if (requestedPhone.length < 10 || requestedPhone.length > 15) {
    return { error: "Telefone do destinatário inválido" };
  }
  return { phone: requestedPhone, recipientType, recipientName: requestedName || undefined };
}

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

  const { message, scheduledAt, repeat, mode, phone: recipientPhone, recipientType, recipientName } = await req.json();
  if (!message || !scheduledAt) return NextResponse.json({ error: "message e scheduledAt obrigatórios" }, { status: 400 });
  if (!REPEAT_TYPES.includes(repeat || "none")) return NextResponse.json({ error: "Repetição inválida" }, { status: 400 });
  if (!Number.isFinite(new Date(scheduledAt).getTime())) return NextResponse.json({ error: "Data inválida" }, { status: 400 });

  const recipient = await resolveRecipient(session.sub, recipientType, recipientPhone, recipientName);
  if ("error" in recipient) return NextResponse.json({ error: recipient.error }, { status: 400 });

  const r = await createReminder({
    userId: session.sub, message: String(message).trim().slice(0, 500), phone: recipient.phone, scheduledAt,
    repeat: repeat || "none", mode: mode === "business" ? "business" : "personal",
    recipientType: recipient.recipientType, recipientName: recipient.recipientName,
  });
  return NextResponse.json(r, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "client") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json();
  const { id } = body;
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  const patch: Partial<Pick<Reminder, "message" | "scheduledAt" | "repeat" | "phone" | "recipientType" | "recipientName">> = {};
  if (body.message !== undefined) patch.message = String(body.message).trim().slice(0, 500);
  if (body.scheduledAt !== undefined) {
    if (!Number.isFinite(new Date(body.scheduledAt).getTime())) return NextResponse.json({ error: "Data inválida" }, { status: 400 });
    patch.scheduledAt = body.scheduledAt;
  }
  if (body.repeat !== undefined) {
    if (!REPEAT_TYPES.includes(body.repeat)) return NextResponse.json({ error: "Repetição inválida" }, { status: 400 });
    patch.repeat = body.repeat;
  }
  if (body.recipientType !== undefined || body.phone !== undefined) {
    const recipient = await resolveRecipient(session.sub, body.recipientType, body.phone, body.recipientName);
    if ("error" in recipient) return NextResponse.json({ error: recipient.error }, { status: 400 });
    patch.phone = recipient.phone;
    patch.recipientType = recipient.recipientType;
    patch.recipientName = recipient.recipientName;
  }

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
