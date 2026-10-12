import "server-only";
import { createHmac } from "node:crypto";
import bcrypt from "bcryptjs";
import { getSupabase } from "./supabase";

export type AdminConfig = {
  adminEmail?: string;
  adminPasswordHash?: string;
};

export async function loadAdmin(): Promise<AdminConfig | null> {
  try {
    const { data, error } = await getSupabase().from("admin_config").select("admin_email, admin_password_hash").eq("id", 1).maybeSingle();
    if (error) throw Error();
    if (!data) return null;
    const row = data as { admin_email: string | null; admin_password_hash: string | null };
    return { adminEmail: row.admin_email ?? undefined, adminPasswordHash: row.admin_password_hash ?? undefined };
  } catch { throw Error("ADMIN_CONFIGURATION_UNAVAILABLE"); }
}

export async function saveAdmin(cfg: AdminConfig): Promise<void> {
  try {
    const { error } = await getSupabase().from("admin_config").upsert({ id: 1, admin_email: cfg.adminEmail, admin_password_hash: cfg.adminPasswordHash });
    if (error) throw Error();
  } catch { throw Error("ADMIN_CONFIGURATION_UNAVAILABLE"); }
}

type AdminCredential = { email: string; secret: string; bootstrap: boolean };
async function currentCredential(): Promise<AdminCredential | null> {
  const cfg = await loadAdmin();
  if (cfg !== null) {
    if (!cfg.adminEmail || !cfg.adminPasswordHash) return null;
    return { email: cfg.adminEmail.trim().toLowerCase(), secret: cfg.adminPasswordHash, bootstrap: false };
  }
  const email = process.env.ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase();
  const secret = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  return email && secret ? { email, secret, bootstrap: true } : null;
}
function credentialVersion(credential: AdminCredential): string {
  const key = process.env.JWT_SECRET;
  if (!key) throw Error("ADMIN_SESSION_UNAVAILABLE");
  // Never put the password/hash itself in a session. Domain-separated keyed
  // digest changes immediately when the active admin credential changes.
  return createHmac("sha256", key).update("zelo-admin-session-v1\0")
    .update(JSON.stringify([credential.bootstrap, credential.email, credential.secret])).digest("hex");
}
export async function getAdminCredentialVersion(): Promise<{ email: string; version: string } | null> {
  const credential = await currentCredential();
  return credential ? { email: credential.email, version: credentialVersion(credential) } : null;
}

/** Antes de existir um admin configurado (admin_config vazio), o único
 *  jeito de entrar é via credenciais definidas nas envs ADMIN_BOOTSTRAP_EMAIL
 *  / ADMIN_BOOTSTRAP_PASSWORD — sem isso configurado, não tem como logar até
 *  o operador definir essas envs. Nada de senha padrão fixa no código: era
 *  literalmente exibida na tela de login, então qualquer um que lesse o
 *  repositório (público) tinha acesso admin completo. */
export async function validateAdmin(email: string, password: string): Promise<boolean> {
  return (await authenticateAdmin(email, password)) !== null;
}
/** Attest the exact credential validated; signing rechecks this version so a
 * concurrent password change cannot turn an old validation into a new session. */
export async function authenticateAdmin(email: string, password: string): Promise<string | null> {
  if (typeof email !== "string" || email.length > 254 || typeof password !== "string" || !password || password.length > 128) return null;
  const credential = await currentCredential();
  if (!credential || email.trim().toLowerCase() !== credential.email) return null;
  const valid = credential.bootstrap ? password === credential.secret : await bcrypt.compare(password, credential.secret);
  return valid ? credentialVersion(credential) : null;
}

export async function setAdminPassword(email: string, password: string) {
  if (typeof email !== "string" || !email.trim() || email.length > 254 || typeof password !== "string" || password.length < 12 || password.length > 128) throw Error("ADMIN_INPUT_INVALID");
  await saveAdmin({ adminEmail: email.trim().toLowerCase(), adminPasswordHash: await bcrypt.hash(password, 10) });
}
