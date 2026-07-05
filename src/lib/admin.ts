import { readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";
import bcrypt from "bcryptjs";

export type AdminConfig = {
  adminEmail?: string;
  adminPasswordHash?: string;
  wppServer?: string;
  wppSecretKey?: string;   // secret key para gerar tokens no servidor WPPConnect
  wppToken?: string;       // JWT gerado automaticamente (não digitar manualmente)
  wppSession?: string;
  geminiApiKey?: string;
  appBaseUrl?: string;
  wppBotNumber?: string;
  googleClientId?: string;
  googleClientSecret?: string;
};

const FILE = path.join(process.cwd(), "data", "admin.json");

export function loadAdmin(): AdminConfig {
  try {
    if (!existsSync(FILE)) return {};
    return JSON.parse(readFileSync(FILE, "utf-8"));
  } catch { return {}; }
}

export function saveAdmin(cfg: AdminConfig) {
  writeFileSync(FILE, JSON.stringify(cfg, null, 2));
}

export async function validateAdmin(email: string, password: string): Promise<boolean> {
  const cfg = loadAdmin();

  // Primeira vez: sem admin configurado → aceita admin@controlaai.app / admin123
  if (!cfg.adminEmail || !cfg.adminPasswordHash) {
    if (email === "admin@controlaai.app" && password === "admin123") {
      return true;
    }
    return false;
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

// Re-exporta funções de wppconnect usando admin config
export function getAdminWppConfig() {
  const cfg = loadAdmin();
  return {
    wppServer: cfg.wppServer || process.env.WPPCONNECT_SERVER || "",
    wppToken: cfg.wppToken || process.env.WPPCONNECT_TOKEN || "",
    wppSession: cfg.wppSession || process.env.WPPCONNECT_SESSION || "controlaai",
    geminiApiKey: cfg.geminiApiKey || process.env.GEMINI_API_KEY || "",
    appBaseUrl: cfg.appBaseUrl || "",
  };
}
