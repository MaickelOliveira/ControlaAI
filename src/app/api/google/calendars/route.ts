import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getSelectedCalendar, listGoogleCalendars, selectGoogleCalendar } from "@/lib/google-oauth";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    const [calendars, selected] = await Promise.all([
      listGoogleCalendars(session.sub),
      getSelectedCalendar(session.sub),
    ]);
    return NextResponse.json({ calendars, selectedCalendarId: selected.id });
  } catch (error) {
    console.error("[google-calendars GET]", error);
    return NextResponse.json({
      error: "Não foi possível carregar suas agendas. Reconecte o Google para autorizar a seleção.",
      reauthRequired: true,
    }, { status: 400 });
  }
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { calendarId } = await req.json();
  if (typeof calendarId !== "string" || !calendarId.trim()) {
    return NextResponse.json({ error: "calendarId é obrigatório" }, { status: 400 });
  }
  try {
    const selected = await selectGoogleCalendar(session.sub, calendarId);
    return NextResponse.json({ selected });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível selecionar a agenda";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
