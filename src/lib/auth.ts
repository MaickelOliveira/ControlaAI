import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "controlaai-secret-2026-change-in-prod"
);

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
};

export async function signToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(SECRET);
}

export async function verifyToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload as unknown as SessionPayload;
  } catch { return null; }
}

// ── Cliente ──────────────────────────────────
export async function getSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  const token = jar.get(CLIENT_COOKIE)?.value;
  if (!token) return null;
  return verifyToken(token);
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
