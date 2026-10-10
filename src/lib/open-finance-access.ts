import "server-only";
import { getSupabase } from "./supabase";
import type { User } from "./users";

export type OpenFinanceScope = { userId: string; mode: "personal" | "business"; environment: "production" };
type Identity = Pick<User, "id" | "email" | "plan" | "activeMode">;

/** Email comes from the current database user, never the JWT or request body.
 * Public rollout requires a separate reviewed gate; this flag stays owner-only. */
export async function getOpenFinanceAccess(user: Identity, requestedMode?: string | null): Promise<OpenFinanceScope | null> {
  if (process.env.OPEN_FINANCE_ENABLED !== "true") return null;
  const ownerEmail = process.env.OPEN_FINANCE_OWNER_EMAIL?.trim().toLowerCase();
  if (!ownerEmail || user.email.trim().toLowerCase() !== ownerEmail) return null;
  if (!process.env.POLP_PRODUCTION_CLIENT_ID || !process.env.POLP_PRODUCTION_CLIENT_SECRET) return null;
  const mode = requestedMode ?? user.activeMode;
  if (mode !== "personal" && mode !== "business") return null;
  if (mode === "business" && user.plan !== "business") return null;
  try {
    const { data, error } = await getSupabase().rpc("zelo_of_access", { p_user: user.id });
    if (error || !data || data.enabled !== true || data.country_code !== "BR" || !data.country_verified_at) return null;
    return { userId: user.id, mode, environment: "production" };
  } catch { return null; }
}

export function requireOpenFinanceOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  const expected = process.env.OPEN_FINANCE_APP_ORIGIN || new URL(request.url).origin;
  if (!origin || origin !== expected || request.headers.get("sec-fetch-site") === "cross-site") {
    throw new Error("INVALID_ORIGIN");
  }
}
