import { google } from "googleapis";
import { randomUUID } from "crypto";
import { getSelectedCalendar, getValidClient } from "./google-oauth";
import type { MeetAttendee } from "./meets";

export type GoogleCalendarEventInput = {
  userId: string;
  title: string;
  description?: string;
  location?: string;
  startAt: string;
  endAt?: string;
  allDay?: boolean;
  repeat?: "none" | "daily" | "weekly" | "monthly" | "yearly";
  attendees?: MeetAttendee[];
  withMeet?: boolean;
};

export type GoogleCalendarEventResult = {
  calendarEventId: string;
  googleCalendarId: string;
  meetLink?: string;
};

function dateInSaoPaulo(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function nextDate(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function recurrenceFor(repeat?: GoogleCalendarEventInput["repeat"]): string[] | undefined {
  const frequency = repeat && repeat !== "none" ? repeat.toUpperCase() : null;
  return frequency ? [`RRULE:FREQ=${frequency}`] : undefined;
}

function eventTimes(input: GoogleCalendarEventInput) {
  if (input.allDay) {
    const startDate = dateInSaoPaulo(input.startAt);
    const endDate = input.endAt ? dateInSaoPaulo(input.endAt) : nextDate(startDate);
    return { start: { date: startDate }, end: { date: endDate === startDate ? nextDate(startDate) : endDate } };
  }
  const endAt = input.endAt || new Date(new Date(input.startAt).getTime() + 60 * 60_000).toISOString();
  return {
    start: { dateTime: input.startAt, timeZone: "America/Sao_Paulo" },
    end: { dateTime: endAt, timeZone: "America/Sao_Paulo" },
  };
}

export async function createGoogleCalendarEvent(input: GoogleCalendarEventInput): Promise<GoogleCalendarEventResult> {
  const auth = await getValidClient(input.userId);
  const calendar = google.calendar({ version: "v3", auth });
  const selected = await getSelectedCalendar(input.userId);
  const attendees = (input.attendees || []).filter(a => a.email).map(a => ({ email: a.email!, displayName: a.name }));
  const times = eventTimes(input);
  const requestBody = {
    summary: input.title,
    description: input.description,
    location: input.location,
    ...times,
    recurrence: recurrenceFor(input.repeat),
    attendees,
    ...(input.withMeet ? {
      conferenceData: {
        createRequest: {
          requestId: randomUUID(),
          conferenceSolutionKey: { type: "hangoutsMeet" as const },
        },
      },
    } : {}),
  };
  const { data } = await calendar.events.insert({
    calendarId: selected.id,
    conferenceDataVersion: input.withMeet ? 1 : 0,
    sendUpdates: attendees.length ? "all" : "none",
    requestBody,
  });
  if (!data.id) throw new Error("Google Calendar não retornou o identificador do evento");
  const meetLink = data.conferenceData?.entryPoints?.find(e => e.entryPointType === "video")?.uri || data.hangoutLink || undefined;
  if (input.withMeet && !meetLink) throw new Error("Google Meet não retornou o link da reunião");
  return { calendarEventId: data.id, googleCalendarId: selected.id, meetLink };
}

export async function updateGoogleCalendarEvent(input: GoogleCalendarEventInput & {
  calendarEventId: string;
  googleCalendarId?: string;
}): Promise<void> {
  const auth = await getValidClient(input.userId);
  const calendar = google.calendar({ version: "v3", auth });
  const selected = input.googleCalendarId || (await getSelectedCalendar(input.userId)).id;
  const times = eventTimes(input);
  await calendar.events.patch({
    calendarId: selected,
    eventId: input.calendarEventId,
    sendUpdates: "all",
    requestBody: {
      summary: input.title,
      description: input.description,
      location: input.location,
      ...times,
      recurrence: recurrenceFor(input.repeat),
      status: input.repeat === undefined ? undefined : "confirmed",
    },
  });
}

export async function deleteGoogleCalendarEvent(userId: string, calendarEventId: string, googleCalendarId?: string): Promise<void> {
  const auth = await getValidClient(userId);
  const calendar = google.calendar({ version: "v3", auth });
  const selected = googleCalendarId || (await getSelectedCalendar(userId)).id;
  try {
    await calendar.events.delete({ calendarId: selected, eventId: calendarEventId, sendUpdates: "all" });
  } catch (error) {
    const status = (error as { code?: number; response?: { status?: number } }).code || (error as { response?: { status?: number } }).response?.status;
    if (status !== 404 && status !== 410) throw error;
  }
}

export async function addMeetToGoogleCalendarEvent(params: {
  userId: string;
  calendarEventId: string;
  googleCalendarId?: string;
}): Promise<string> {
  const auth = await getValidClient(params.userId);
  const calendar = google.calendar({ version: "v3", auth });
  const calendarId = params.googleCalendarId || (await getSelectedCalendar(params.userId)).id;
  const { data } = await calendar.events.patch({
    calendarId,
    eventId: params.calendarEventId,
    conferenceDataVersion: 1,
    sendUpdates: "all",
    requestBody: {
      conferenceData: {
        createRequest: {
          requestId: randomUUID(),
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      },
    },
  });
  const meetLink = data.conferenceData?.entryPoints?.find(entry => entry.entryPointType === "video")?.uri || data.hangoutLink;
  if (!meetLink) throw new Error("Google Meet não retornou o link da reunião");
  return meetLink;
}
