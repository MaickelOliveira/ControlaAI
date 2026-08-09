import { google } from "googleapis";
import { readFileSync, existsSync } from "fs";
import { randomUUID } from "crypto";
import path from "path";
import { getConfig } from "./whatsapp-config";
import { encryptField, decryptField } from "./crypto-store";
import { writeJSONAtomic } from "./json-store";

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
    const raw = JSON.parse(readFileSync(TOKEN_FILE, "utf-8")) as TokenStore;
    const out: TokenStore = {};
    for (const userId of Object.keys(raw)) {
      out[userId] = { ...raw[userId], accessToken: decryptField(raw[userId].accessToken)!, refreshToken: decryptField(raw[userId].refreshToken)! };
    }
    return out;
  } catch { return {}; }
}

function saveStore(store: TokenStore) {
  const out: TokenStore = {};
  for (const userId of Object.keys(store)) {
    out[userId] = { ...store[userId], accessToken: encryptField(store[userId].accessToken)!, refreshToken: encryptField(store[userId].refreshToken)! };
  }
  writeJSONAtomic(TOKEN_FILE, out);
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

export function getAuthClient() {
  const cfg = getConfig();
  const clientId = cfg.googleClientId || process.env.GOOGLE_CLIENT_ID;
  const clientSecret = cfg.googleClientSecret || process.env.GOOGLE_CLIENT_SECRET;
  const appUrl = (cfg.appBaseUrl || process.env.APP_URL || "").replace(/\/$/, "");
  return new google.auth.OAuth2(
    clientId,
    clientSecret,
    `${appUrl}/api/auth/google/callback`
  );
}

export function getAuthUrl(userId: string): string {
  const client = getAuthClient();
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
