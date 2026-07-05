import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createAppointment, getAppointments } from "@/lib/agenda";
import { createMeetEvent } from "@/lib/google-meet";
import { isConnected } from "@/lib/google-oauth";
import type { MeetAttendee } from "@/lib/meets";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const appointments = getAppointments(session.sub);
  return NextResponse.json(appointments);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json();
  const { title, description, location, startAt, endAt, allDay, repeat, withMeet, attendees } = body;
  if (!title || !startAt) {
    return NextResponse.json({ error: "title e startAt são obrigatórios" }, { status: 400 });
  }

  let meetLink: string | undefined;
  let calendarEventId: string | undefined;

  if (withMeet && endAt) {
    if (!isConnected(session.sub)) {
      return NextResponse.json({ error: "Google não conectado. Acesse Configurações → Integrações." }, { status: 400 });
    }
    try {
      const result = await createMeetEvent({
        userId: session.sub, title, description, startAt, endAt,
        attendees: (attendees as MeetAttendee[]) || [],
      });
      meetLink = result.meetLink;
      calendarEventId = result.calendarEventId;
    } catch (e) {
      console.error("[agenda POST meet]", e);
      return NextResponse.json({ error: "Erro ao criar Google Meet. Verifique a conexão Google." }, { status: 500 });
    }
  }

  const appointment = createAppointment({
    userId: session.sub,
    title,
    description: description || undefined,
    location: location || undefined,
    startAt,
    endAt: endAt || undefined,
    allDay: allDay ?? false,
    repeat: repeat || "none",
    status: "scheduled",
    source: "web",
    meetLink,
    calendarEventId,
  });

  return NextResponse.json(appointment, { status: 201 });
}
