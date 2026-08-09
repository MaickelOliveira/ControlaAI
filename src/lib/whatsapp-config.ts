import { getSupabase } from "./supabase";
import { encryptField, decryptField } from "./crypto-store";

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

export async function getConfig(): Promise<WhatsAppConfig> {
  const { data, error } = await getSupabase().from("whatsapp_config").select("data").eq("id", 1).maybeSingle();
  if (error || !data) return { ...DEFAULT_CONFIG };
  const parsed = (data as { data: WhatsAppConfig }).data;
  return decryptSensitive({ ...DEFAULT_CONFIG, ...parsed });
}

export async function saveConfig(config: WhatsAppConfig): Promise<void> {
  await getSupabase().from("whatsapp_config").upsert({ id: 1, data: encryptSensitive(config) });
}
