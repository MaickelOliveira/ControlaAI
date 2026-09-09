import { createGoogleCalendarEvent } from "./google-calendar";
import type { MeetAttendee } from "./meets";

export async function createMeetEvent(params: {
  userId: string;
  title: string;
  description?: string;
  startAt: string; // ISO UTC
  endAt: string;   // ISO UTC
  attendees: MeetAttendee[];
}): Promise<{ meetLink: string; calendarEventId: string; googleCalendarId: string }> {
  const result = await createGoogleCalendarEvent({ ...params, withMeet: true });
  return { ...result, meetLink: result.meetLink! };
}
