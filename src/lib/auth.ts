import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { getUserById, hasAccess, type User } from "./users";

// Evita que cada API aberta em paralelo por uma página repita a mesma ida ao
// Supabase só para validar a conta. Dez segundos preservam revogação rápida e
// eliminam a viagem de rede extra nas navegações seguintes do dashboard.
const USER_AUTH_CACHE_MS = 10_000;
const userAuthCache = new Map<string, { expiresAt: number; value: Promise<User | null> }>();

function getCachedUser(userId: string): Promise<User | null> {
  const now = Date.now();
  const cached = userAuthCache.get(userId);
  if (cached && cached.expiresAt > now) return cached.value;

  const value = getUserById(userId).catch(error => {
    userAuthCache.delete(userId);
    throw error;
  });
  userAuthCache.set(userId, { expiresAt: now + USER_AUTH_CACHE_MS, value });
  return value;
}

// Sem valor padrão de propósito: uma chave fixa no código público permitiria
// qualquer um forjar um cookie de sessão válido (inclusive de admin). A
// checagem é preguiçosa (só na hora de assinar/verificar, não no import do
// módulo) porque o `next build` importa essas rotas pra coletar dados de
// página mesmo sem nenhuma requisição real acontecer — falhar no import
// quebraria o build inteiro em vez de só o runtime sem a env configurada.
function getSecret(): Uint8Array {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET não configurado — defina essa variável de ambiente antes de iniciar o servidor.");
  }
  return new TextEncoder().encode(process.env.JWT_SECRET);
}

// Cookies separados para cliente e admin — evita conflito no mesmo navegador
const CLIENT_COOKIE = "ca_session";
const ADMIN_COOKIE  = "ca_admin";

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  maxAge: 60 * 60 * 24 * 7,
  path: "/",
};

export type SessionPayload = {
  sub: string;
  name: string;
  email: string;
  plan: string;
  role: "client" | "admin";
  iat?: number;
};

export async function signToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret());
}

export async function verifyToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as unknown as SessionPayload;
  } catch { return null; }
}

// ── Cliente ──────────────────────────────────
/** O JWT em si continua válido por até 7 dias mesmo que o admin desative o
 *  cliente ou o trial vença nesse meio-tempo — sem checar o status real do
 *  usuário aqui, o cookie sozinho bastava pra continuar usando o painel
 *  inteiro (todas as rotas client-side dependem só disso pra autorizar).
 *  Como getSession() já é chamado por praticamente toda API do dashboard,
 *  essa checagem central cobre tudo de uma vez, sem precisar mexer rota
 *  por rota. */
export async function getSessionWithUser(): Promise<{ session: SessionPayload; user: User } | null> {
  const jar = await cookies();
  const token = jar.get(CLIENT_COOKIE)?.value;
  if (!token) return null;
  const payload = await verifyToken(token);
  if (!payload) return null;

  const user = await getCachedUser(payload.sub);
  if (!user || !hasAccess(user)) return null;
  if (user.passwordChangedAt && (!payload.iat || payload.iat * 1000 < new Date(user.passwordChangedAt).getTime())) return null;

  return { session: payload, user };
}

export async function getSession(): Promise<SessionPayload | null> {
  return (await getSessionWithUser())?.session ?? null;
}

export async function setSessionCookie(token: string) {
  const jar = await cookies();
  jar.set(CLIENT_COOKIE, token, COOKIE_OPTS);
}

export async function clearSession() {
  const jar = await cookies();
  jar.delete(CLIENT_COOKIE);
}

// ── Admin ─────────────────────────────────────
export async function getAdminSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  const token = jar.get(ADMIN_COOKIE)?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function setAdminSessionCookie(token: string) {
  const jar = await cookies();
  jar.set(ADMIN_COOKIE, token, COOKIE_OPTS);
}

export async function clearAdminSession() {
  const jar = await cookies();
  jar.delete(ADMIN_COOKIE);
}

export function getClientCookieName() { return CLIENT_COOKIE; }
export function getAdminCookieName()  { return ADMIN_COOKIE; }
