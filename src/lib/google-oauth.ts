import { google } from "googleapis";
import { randomUUID } from "crypto";
import { getConfig } from "./whatsapp-config";
import { encryptField, decryptField } from "./crypto-store";
import { getSupabase } from "./supabase";

const SCOPES = ["https://www.googleapis.com/auth/calendar.events"];

type TokenEntry = {
  accessToken: string;
  refreshToken: string;
  expiresAt: string; // ISO
};

type Row = { user_id: string; access_token: string; refresh_token: string; expires_at: string };

async function loadEntry(userId: string): Promise<TokenEntry | null> {
  const { data, error } = await getSupabase().from("google_tokens").select("*").eq("user_id", userId).maybeSingle();
  if (error || !data) return null;
  const row = data as Row;
  return { accessToken: decryptField(row.access_token)!, refreshToken: decryptField(row.refresh_token)!, expiresAt: row.expires_at };
}

async function saveEntry(userId: string, entry: TokenEntry): Promise<void> {
  await getSupabase().from("google_tokens").upsert({
    user_id: userId,
    access_token: encryptField(entry.accessToken),
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
type PendingState = { userId: string; expiresAt: number };
const pendingStates = new Map<string, PendingState>();
const STATE_TTL_MS = 10 * 60_000;

export function resolveState(state: string | null): string | null {
  if (!state) return null;
  const entry = pendingStates.get(state);
  pendingStates.delete(state); // uso único, vale mesmo se expirado
  if (!entry || Date.now() > entry.expiresAt) return null;
  return entry.userId;
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

export async function getAuthUrl(userId: string): Promise<string> {
  const client = await getAuthClient();
  const state = randomUUID();
  pendingStates.set(state, { userId, expiresAt: Date.now() + STATE_TTL_MS });
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
  await saveEntry(userId, {
    accessToken: tokens.access_token!,
    refreshToken: tokens.refresh_token!,
    expiresAt: new Date((tokens.expiry_date ?? Date.now() + 3600_000)).toISOString(),
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
