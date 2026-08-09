import bcrypt from "bcryptjs";
import { getSupabase } from "./supabase";

export type AdminConfig = {
  adminEmail?: string;
  adminPasswordHash?: string;
};

export async function loadAdmin(): Promise<AdminConfig> {
  const { data, error } = await getSupabase().from("admin_config").select("admin_email, admin_password_hash").eq("id", 1).maybeSingle();
  if (error || !data) return {};
  const row = data as { admin_email: string | null; admin_password_hash: string | null };
  return { adminEmail: row.admin_email ?? undefined, adminPasswordHash: row.admin_password_hash ?? undefined };
}

export async function saveAdmin(cfg: AdminConfig): Promise<void> {
  await getSupabase().from("admin_config").upsert({ id: 1, admin_email: cfg.adminEmail, admin_password_hash: cfg.adminPasswordHash });
}

/** Antes de existir um admin configurado (admin_config vazio), o único
 *  jeito de entrar é via credenciais definidas nas envs ADMIN_BOOTSTRAP_EMAIL
 *  / ADMIN_BOOTSTRAP_PASSWORD — sem isso configurado, não tem como logar até
 *  o operador definir essas envs. Nada de senha padrão fixa no código: era
 *  literalmente exibida na tela de login, então qualquer um que lesse o
 *  repositório (público) tinha acesso admin completo. */
export async function validateAdmin(email: string, password: string): Promise<boolean> {
  const cfg = await loadAdmin();

  if (!cfg.adminEmail || !cfg.adminPasswordHash) {
    const bootEmail = process.env.ADMIN_BOOTSTRAP_EMAIL;
    const bootPassword = process.env.ADMIN_BOOTSTRAP_PASSWORD;
    if (!bootEmail || !bootPassword) return false;
    return email === bootEmail && password === bootPassword;
  }
  if (email !== cfg.adminEmail) return false;
  return bcrypt.compare(password, cfg.adminPasswordHash);
}

export async function setAdminPassword(email: string, password: string) {
  const cfg = await loadAdmin();
  cfg.adminEmail = email;
  cfg.adminPasswordHash = await bcrypt.hash(password, 10);
  await saveAdmin(cfg);
}
