import { readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";

const CONFIG_FILE = path.join(process.cwd(), "data", "whatsapp-config.json");

export type EvolutionCredentials = {
  server?: string;
  adminKey?: string;
  instanceName?: string;
  instanceApiKey?: string; // apikey devolvida na criação da instância — usada em vez da adminKey quando disponível
};

export type WabaCredentials = {
  phoneNumberId?: string;
  accessToken?: string;
  verifyToken?: string;
};

export type WhatsAppConfig = {
  provider: "evolution" | "waba";
  evolution?: EvolutionCredentials;
  waba?: WabaCredentials;
  geminiApiKey?: string;
  appBaseUrl?: string;
  wppBotNumber?: string;
  googleClientId?: string;
  googleClientSecret?: string;
};

const DEFAULT_CONFIG: WhatsAppConfig = { provider: "evolution" };

export function getConfig(): WhatsAppConfig {
  try {
    if (!existsSync(CONFIG_FILE)) return { ...DEFAULT_CONFIG };
    const parsed = JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(config: WhatsAppConfig) {
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}
