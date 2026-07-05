import { google } from "googleapis";
import { randomUUID } from "crypto";
import { getValidClient } from "./google-oauth";
import type { MeetAttendee } from "./meets";

export async function createMeetEvent(params: {
  userId: string;
  title: string;
  description?: string;
  startAt: string; // ISO UTC
  endAt: string;   // ISO UTC
  attendees: MeetAttendee[];
}): Promise<{ meetLink: string; calendarEventId: string }> {
  const auth = await getValidClient(params.userId);
  const calendar = google.calendar({ version: "v3", auth });

  const emailAttendees = params.attendees
    .filter(a => a.email)
    .map(a => ({ email: a.email!, displayName: a.name }));

  const res = await calendar.events.insert({
    calendarId: "primary",
    conferenceDataVersion: 1,
    sendUpdates: emailAttendees.length > 0 ? "all" : "none",
    requestBody: {
      summary: params.title,
      description: params.description,
      start: { dateTime: params.startAt, timeZone: "America/Sao_Paulo" },
      end: { dateTime: params.endAt, timeZone: "America/Sao_Paulo" },
      attendees: emailAttendees,
      conferenceData: {
        createRequest: {
          requestId: randomUUID(),
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      },
    },
  });

  const event = res.data;
  const meetLink =
    event.conferenceData?.entryPoints?.find(e => e.entryPointType === "video")?.uri ??
    event.hangoutLink ??
    "";

  if (!meetLink) throw new Error("Google Meet link não retornado");

  return { meetLink, calendarEventId: event.id! };
}
