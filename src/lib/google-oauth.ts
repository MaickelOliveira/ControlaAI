import { google } from "googleapis";
import { readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";

const TOKEN_FILE = path.join(process.cwd(), "data", "google-tokens.json");

const SCOPES = ["https://www.googleapis.com/auth/calendar.events"];

type TokenEntry = {
  accessToken: string;
  refreshToken: string;
  expiresAt: string; // ISO
};

type TokenStore = Record<string, TokenEntry>;

function loadStore(): TokenStore {
  try {
    if (!existsSync(TOKEN_FILE)) return {};
    return JSON.parse(readFileSync(TOKEN_FILE, "utf-8"));
  } catch { return {}; }
}

function saveStore(store: TokenStore) {
  writeFileSync(TOKEN_FILE, JSON.stringify(store, null, 2));
}

export function getAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.APP_URL}/api/auth/google/callback`
  );
}

export function getAuthUrl(userId: string): string {
  const client = getAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    state: userId,
  });
}

export async function exchangeCode(code: string, userId: string): Promise<void> {
  const client = getAuthClient();
  const { tokens } = await client.getToken(code);
  const store = loadStore();
  store[userId] = {
    accessToken: tokens.access_token!,
    refreshToken: tokens.refresh_token!,
    expiresAt: new Date((tokens.expiry_date ?? Date.now() + 3600_000)).toISOString(),
  };
  saveStore(store);
}

export async function getValidClient(userId: string) {
  const store = loadStore();
  const entry = store[userId];
  if (!entry) throw new Error("Google não conectado para este usuário");

  const client = getAuthClient();
  client.setCredentials({
    access_token: entry.accessToken,
    refresh_token: entry.refreshToken,
    expiry_date: new Date(entry.expiresAt).getTime(),
  });

  // Refresh se expirado ou faltando menos de 5 minutos
  if (new Date(entry.expiresAt).getTime() < Date.now() + 5 * 60_000) {
    const { credentials } = await client.refreshAccessToken();
    store[userId] = {
      accessToken: credentials.access_token!,
      refreshToken: credentials.refresh_token ?? entry.refreshToken,
      expiresAt: new Date(credentials.expiry_date ?? Date.now() + 3600_000).toISOString(),
    };
    saveStore(store);
    client.setCredentials(credentials);
  }

  return client;
}

export async function revokeTokens(userId: string): Promise<void> {
  const store = loadStore();
  const entry = store[userId];
  if (entry) {
    try {
      const client = getAuthClient();
      client.setCredentials({ access_token: entry.accessToken });
      await client.revokeCredentials();
    } catch { /* ignora erro de revogação */ }
    delete store[userId];
    saveStore(store);
  }
}

export function isConnected(userId: string): boolean {
  const store = loadStore();
  return Boolean(store[userId]?.refreshToken);
}

export async function getConnectedEmail(userId: string): Promise<string | null> {
  try {
    const client = await getValidClient(userId);
    const oauth2 = google.oauth2({ version: "v2", auth: client });
    const { data } = await oauth2.userinfo.get();
    return data.email ?? null;
  } catch { return null; }
}
