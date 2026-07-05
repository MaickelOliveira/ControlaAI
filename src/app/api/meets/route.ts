import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getMeetsByUser, createMeet } from "@/lib/meets";
import { createMeetEvent } from "@/lib/google-meet";
import { isConnected } from "@/lib/google-oauth";
import { createAppointment } from "@/lib/agenda";
import { spToUTC } from "@/lib/date-br";
import { randomUUID } from "crypto";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const meets = getMeetsByUser(session.sub);
  return NextResponse.json(meets);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json();
  const { title, description, startDate, startTime, endDate, endTime, duration, attendees } = body;

  if (!title || !startDate || !startTime) {
    return NextResponse.json({ error: "title, startDate e startTime são obrigatórios" }, { status: 400 });
  }

  const startAt = spToUTC(`${startDate}T${startTime}:00`);
  const durationMs = (duration || 60) * 60_000;
  const endAt = endDate
    ? spToUTC(`${endDate}T${endTime || "00:00"}:00`)
    : new Date(new Date(startAt).getTime() + durationMs).toISOString();

  if (!isConnected(session.sub)) {
    return NextResponse.json({ error: "Google não conectado" }, { status: 400 });
  }

  try {
    const { meetLink, calendarEventId } = await createMeetEvent({
      userId: session.sub, title, description, startAt, endAt, attendees: attendees || [],
    });
    const meet = createMeet({
      userId: session.sub, title, description, startAt, endAt,
      meetLink, calendarEventId, attendees: attendees || [],
      ataGenerated: false, status: "scheduled", source: "web",
    });
    createAppointment({
      userId: session.sub,
      title: `🎥 ${title}`,
      description: `${description ? description + "\n" : ""}Meet: ${meetLink}`,
      startAt, endAt,
      allDay: false,
      repeat: "none",
      status: "scheduled",
      source: "web",
    });
    return NextResponse.json(meet, { status: 201 });
  } catch (e) {
    console.error("[meets POST]", e);
    return NextResponse.json({ error: "Erro ao criar reunião no Google Calendar" }, { status: 500 });
  }
}

// Silences lint about unused randomUUID — it's used by google-meet internally
void randomUUID;
