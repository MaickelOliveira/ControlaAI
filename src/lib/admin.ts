import { readFileSync, existsSync } from "fs";
import { writeJSONAtomic } from "./json-store";
import path from "path";
import bcrypt from "bcryptjs";

export type AdminConfig = {
  adminEmail?: string;
  adminPasswordHash?: string;
};

const FILE = path.join(process.cwd(), "data", "admin.json");

export function loadAdmin(): AdminConfig {
  try {
    if (!existsSync(FILE)) return {};
    return JSON.parse(readFileSync(FILE, "utf-8"));
  } catch { return {}; }
}

export function saveAdmin(cfg: AdminConfig) {
  writeJSONAtomic(FILE, cfg);
}

/** Antes de existir um admin configurado (data/admin.json vazio), o único
 *  jeito de entrar é via credenciais definidas nas envs ADMIN_BOOTSTRAP_EMAIL
 *  / ADMIN_BOOTSTRAP_PASSWORD — sem isso configurado, não tem como logar até
 *  o operador definir essas envs. Nada de senha padrão fixa no código: era
 *  literalmente exibida na tela de login, então qualquer um que lesse o
 *  repositório (público) tinha acesso admin completo. */
export async function validateAdmin(email: string, password: string): Promise<boolean> {
  const cfg = loadAdmin();

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
  const cfg = loadAdmin();
  cfg.adminEmail = email;
  cfg.adminPasswordHash = await bcrypt.hash(password, 10);
  saveAdmin(cfg);
}
