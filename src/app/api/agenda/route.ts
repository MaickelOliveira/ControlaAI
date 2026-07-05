import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createAppointment, getAppointments } from "@/lib/agenda";

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
  const { title, description, location, startAt, endAt, allDay, repeat } = body;
  if (!title || !startAt) {
    return NextResponse.json({ error: "title e startAt são obrigatórios" }, { status: 400 });
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
  });

  return NextResponse.json(appointment, { status: 201 });
}
