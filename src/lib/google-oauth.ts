import { google } from "googleapis";
import { randomUUID } from "crypto";
import { getConfig } from "./whatsapp-config";
import { encryptField, decryptField } from "./crypto-store";
import { getSupabase } from "./supabase";

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  "openid",
  "email",
];

export type GoogleCalendarOption = {
  id: string;
  name: string;
  primary: boolean;
  accessRole: string;
  backgroundColor?: string;
};

type TokenEntry = {
  accessToken: string;
  refreshToken: string;
  expiresAt: string; // ISO
  selectedCalendarId: string;
  selectedCalendarName?: string;
};

type Row = {
  user_id: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
};

type StoredAccessToken = { token: string; selectedCalendarId?: string; selectedCalendarName?: string };

function decodeStoredAccessToken(value: string): StoredAccessToken {
  const decrypted = decryptField(value)!;
  try {
    const parsed = JSON.parse(decrypted) as StoredAccessToken;
    if (parsed && typeof parsed.token === "string") return parsed;
  } catch { /* token legado era salvo diretamente, sem envelope JSON */ }
  return { token: decrypted };
}

async function loadEntry(userId: string): Promise<TokenEntry | null> {
  const { data, error } = await getSupabase().from("google_tokens").select("*").eq("user_id", userId).maybeSingle();
  if (error || !data) return null;
  const row = data as Row;
  const stored = decodeStoredAccessToken(row.access_token);
  return {
    accessToken: stored.token,
    refreshToken: decryptField(row.refresh_token)!,
    expiresAt: row.expires_at,
    selectedCalendarId: stored.selectedCalendarId || "primary",
    selectedCalendarName: stored.selectedCalendarName,
  };
}

async function saveEntry(userId: string, entry: TokenEntry): Promise<void> {
  await getSupabase().from("google_tokens").upsert({
    user_id: userId,
    access_token: encryptField(JSON.stringify({
      token: entry.accessToken,
      selectedCalendarId: entry.selectedCalendarId,
      selectedCalendarName: entry.selectedCalendarName,
    } satisfies StoredAccessToken)),
    refresh_token: encryptField(entry.refreshToken),
    expires_at: entry.expiresAt,
  });
}

/** state=userId direto (sem nonce) deixava o callback confiar em qualquer
 *  valor que chegasse por query string — um atacante podia forjar uma
 *  chamada ao callback com state=<userId de outra pessoa> e o próprio code
 *  de autorização dele, linkando a AGENDA DELE à conta da vítima (CSRF de
 *  vinculação de conta). O state agora é um nonce aleatório de uso único,
 *  emitido só quando getAuthUrl roda pra uma sessão já autenticada
 *  (api/google/connect), e resolvido de volta pro userId no callback —
 *  nunca aceita um userId vindo direto da query string. */
type PendingState = { userId: string; locale: "pt-BR" | "pt-PT" | "es"; expiresAt: number };
const pendingStates = new Map<string, PendingState>();
const STATE_TTL_MS = 10 * 60_000;

export function resolveState(state: string | null): PendingState | null {
  if (!state) return null;
  const entry = pendingStates.get(state);
  pendingStates.delete(state); // uso único, vale mesmo se expirado
  if (!entry || Date.now() > entry.expiresAt) return null;
  return entry;
}

export async function getAuthClient() {
  const cfg = await getConfig();
  const clientId = cfg.googleClientId || process.env.GOOGLE_CLIENT_ID;
  const clientSecret = cfg.googleClientSecret || process.env.GOOGLE_CLIENT_SECRET;
  const appUrl = (cfg.appBaseUrl || process.env.APP_URL || "").replace(/\/$/, "");
  return new google.auth.OAuth2(
    clientId,
    clientSecret,
    `${appUrl}/api/auth/google/callback`
  );
}

export async function getAuthUrl(userId: string, locale: PendingState["locale"] = "pt-BR"): Promise<string> {
  const client = await getAuthClient();
  const state = randomUUID();
  pendingStates.set(state, { userId, locale, expiresAt: Date.now() + STATE_TTL_MS });
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    state,
  });
}

export async function exchangeCode(code: string, userId: string): Promise<void> {
  const client = await getAuthClient();
  const { tokens } = await client.getToken(code);
  const previous = await loadEntry(userId);
  await saveEntry(userId, {
    accessToken: tokens.access_token!,
    refreshToken: tokens.refresh_token!,
    expiresAt: new Date((tokens.expiry_date ?? Date.now() + 3600_000)).toISOString(),
    selectedCalendarId: previous?.selectedCalendarId || "primary",
    selectedCalendarName: previous?.selectedCalendarName,
  });
}

export async function getValidClient(userId: string) {
  const entry = await loadEntry(userId);
  if (!entry) throw new Error("Google não conectado para este usuário");

  const client = await getAuthClient();
  client.setCredentials({
    access_token: entry.accessToken,
    refresh_token: entry.refreshToken,
    expiry_date: new Date(entry.expiresAt).getTime(),
  });

  // Refresh se expirado ou faltando menos de 5 minutos
  if (new Date(entry.expiresAt).getTime() < Date.now() + 5 * 60_000) {
    const { credentials } = await client.refreshAccessToken();
    await saveEntry(userId, {
      accessToken: credentials.access_token!,
      refreshToken: credentials.refresh_token ?? entry.refreshToken,
      expiresAt: new Date(credentials.expiry_date ?? Date.now() + 3600_000).toISOString(),
      selectedCalendarId: entry.selectedCalendarId,
      selectedCalendarName: entry.selectedCalendarName,
    });
    client.setCredentials(credentials);
  }

  return client;
}

export async function revokeTokens(userId: string): Promise<void> {
  const entry = await loadEntry(userId);
  if (entry) {
    try {
      const client = await getAuthClient();
      client.setCredentials({ access_token: entry.accessToken });
      await client.revokeCredentials();
    } catch { /* ignora erro de revogação */ }
    await getSupabase().from("google_tokens").delete().eq("user_id", userId);
  }
}

export async function isConnected(userId: string): Promise<boolean> {
  const entry = await loadEntry(userId);
  return Boolean(entry?.refreshToken);
}

export async function getConnectedEmail(userId: string): Promise<string | null> {
  try {
    const client = await getValidClient(userId);
    const oauth2 = google.oauth2({ version: "v2", auth: client });
    const { data } = await oauth2.userinfo.get();
    return data.email ?? null;
  } catch { return null; }
}

export async function getSelectedCalendar(userId: string): Promise<{ id: string; name?: string }> {
  const entry = await loadEntry(userId);
  return { id: entry?.selectedCalendarId || "primary", name: entry?.selectedCalendarName };
}

export async function listGoogleCalendars(userId: string): Promise<GoogleCalendarOption[]> {
  const client = await getValidClient(userId);
  const calendar = google.calendar({ version: "v3", auth: client });
  const items: GoogleCalendarOption[] = [];
  let pageToken: string | undefined;
  do {
    const { data } = await calendar.calendarList.list({
      minAccessRole: "writer",
      pageToken,
      showHidden: false,
    });
    for (const item of data.items || []) {
      if (!item.id) continue;
      items.push({
        id: item.id,
        name: item.summaryOverride || item.summary || item.id,
        primary: item.primary === true,
        accessRole: item.accessRole || "reader",
        backgroundColor: item.backgroundColor || undefined,
      });
    }
    pageToken = data.nextPageToken || undefined;
  } while (pageToken);
  return items.sort((a, b) => Number(b.primary) - Number(a.primary) || a.name.localeCompare(b.name));
}

export async function selectGoogleCalendar(userId: string, calendarId: string): Promise<GoogleCalendarOption> {
  const calendars = await listGoogleCalendars(userId);
  const selected = calendars.find(item => item.id === calendarId);
  if (!selected) throw new Error("Agenda do Google não encontrada ou sem permissão de escrita");
  const entry = await loadEntry(userId);
  if (!entry) throw new Error("Google não conectado para este usuário");
  await saveEntry(userId, { ...entry, selectedCalendarId: selected.id, selectedCalendarName: selected.name });
  return selected;
}
