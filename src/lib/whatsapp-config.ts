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

// A configuracao era relida no Supabase em cada etapa de um mesmo envio
// (escolha do provedor, token, numero e despacho). Uma unica mensagem podia
// gerar varias consultas identicas no mesmo segundo. O cache curto mantem a
// configuracao atual no processo, enquanto saveConfig atualiza o valor
// imediatamente. Em outra instancia, a defasagem maxima fica limitada a dez
// segundos, sem comprometer um disparo pontual apos troca de credenciais.
const CONFIG_CACHE_TTL_MS = 10_000;
let configCache: { value: WhatsAppConfig; expiresAt: number } | null = null;
let configLoadPromise: Promise<WhatsAppConfig> | null = null;

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
  const now = Date.now();
  if (configCache && configCache.expiresAt > now) return configCache.value;
  if (configLoadPromise) return configLoadPromise;

  configLoadPromise = (async () => {
    const { data, error } = await getSupabase().from("whatsapp_config").select("data").eq("id", 1).maybeSingle();
    // Falha transitoria nunca entra no cache: o proximo envio tenta o banco
    // novamente em vez de ficar preso ao provedor padrao durante o TTL.
    if (error) return { ...DEFAULT_CONFIG };
    const value = data
      ? decryptSensitive({ ...DEFAULT_CONFIG, ...(data as { data: WhatsAppConfig }).data })
      : { ...DEFAULT_CONFIG };
    configCache = { value, expiresAt: Date.now() + CONFIG_CACHE_TTL_MS };
    return value;
  })();

  try {
    return await configLoadPromise;
  } finally {
    configLoadPromise = null;
  }
}

export async function saveConfig(config: WhatsAppConfig): Promise<void> {
  const { error } = await getSupabase().from("whatsapp_config").upsert({ id: 1, data: encryptSensitive(config) });
  if (error) {
    configCache = null;
    throw new Error(`[whatsapp-config] saveConfig falhou: ${error.message}`);
  }
  configCache = {
    value: { ...DEFAULT_CONFIG, ...config },
    expiresAt: Date.now() + CONFIG_CACHE_TTL_MS,
  };
}
