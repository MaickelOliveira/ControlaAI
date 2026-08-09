import { readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";
import { encryptField, decryptField } from "./crypto-store";

const CONFIG_FILE = path.join(process.cwd(), "data", "whatsapp-config.json");

export type EvolutionCredentials = {
  server?: string;
  adminKey?: string;
  instanceName?: string;
  instanceApiKey?: string; // apikey devolvida na criação da instância — usada em vez da adminKey quando disponível
  webhookSecret?: string; // segredo próprio, embutido na URL do webhook registrada no Evolution (ele não assina requisições)
};

export type WabaCredentials = {
  phoneNumberId?: string;
  accessToken?: string;
  verifyToken?: string;
  appSecret?: string; // App Secret do app Meta — usado pra validar a assinatura (X-Hub-Signature-256) das requisições do webhook
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

/** Tokens/keys de todas as integrações (WABA, Evolution, Gemini, Google
 *  OAuth) ficavam em texto puro nesse JSON — qualquer acesso ao arquivo
 *  (backup, dump, cópia acidental) expunha tudo de uma vez. Criptografados
 *  em disco, decifrados só na leitura em memória. */
function decryptSensitive(cfg: WhatsAppConfig): WhatsAppConfig {
  return {
    ...cfg,
    evolution: cfg.evolution ? {
      ...cfg.evolution,
      adminKey: decryptField(cfg.evolution.adminKey),
      instanceApiKey: decryptField(cfg.evolution.instanceApiKey),
      webhookSecret: decryptField(cfg.evolution.webhookSecret),
    } : cfg.evolution,
    waba: cfg.waba ? {
      ...cfg.waba,
      accessToken: decryptField(cfg.waba.accessToken),
      appSecret: decryptField(cfg.waba.appSecret),
      verifyToken: decryptField(cfg.waba.verifyToken),
    } : cfg.waba,
    geminiApiKey: decryptField(cfg.geminiApiKey),
    googleClientSecret: decryptField(cfg.googleClientSecret),
  };
}

function encryptSensitive(cfg: WhatsAppConfig): WhatsAppConfig {
  return {
    ...cfg,
    evolution: cfg.evolution ? {
      ...cfg.evolution,
      adminKey: encryptField(cfg.evolution.adminKey),
      instanceApiKey: encryptField(cfg.evolution.instanceApiKey),
      webhookSecret: encryptField(cfg.evolution.webhookSecret),
    } : cfg.evolution,
    waba: cfg.waba ? {
      ...cfg.waba,
      accessToken: encryptField(cfg.waba.accessToken),
      appSecret: encryptField(cfg.waba.appSecret),
      verifyToken: encryptField(cfg.waba.verifyToken),
    } : cfg.waba,
    geminiApiKey: encryptField(cfg.geminiApiKey),
    googleClientSecret: encryptField(cfg.googleClientSecret),
  };
}

export function getConfig(): WhatsAppConfig {
  try {
    if (!existsSync(CONFIG_FILE)) return { ...DEFAULT_CONFIG };
    const parsed = JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
    return decryptSensitive({ ...DEFAULT_CONFIG, ...parsed });
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(config: WhatsAppConfig) {
  writeFileSync(CONFIG_FILE, JSON.stringify(encryptSensitive(config), null, 2));
}
