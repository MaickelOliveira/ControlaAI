import { readFileSync, existsSync } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { writeJSONAtomic } from "./json-store";
import { encryptField, decryptField } from "./crypto-store";
import { getUserByEmail, activateUser, deactivateUser, updateUser, type UserPlan } from "./users";

/** Recebe webhooks de plataforma de venda (Hotmart, Kiwify, etc.) e ativa/
 *  desativa/troca o plano do cliente correspondente automaticamente. Como
 *  não dá pra confiar no formato exato do JSON de toda plataforma do
 *  mercado sem ver um payload real (documentação pública de várias delas
 *  não trouxe o formato exato, e advinhar arriscaria ativar/desativar o
 *  cliente errado silenciosamente — grave, afeta cobrança de verdade), o
 *  mapeamento de campos é CONFIGURÁVEL pelo admin em vez de codificado por
 *  plataforma. Hotmart e Kiwify vêm com valores padrão pré-preenchidos
 *  (best-effort, baseado na documentação pública de cada uma) que o admin
 *  deve conferir com um webhook de teste real antes de confiar de olhos
 *  fechados. */

export type BillingWebhookConfig = {
  id: string;
  label: string;
  active: boolean;
  // Autenticação: ou um campo dentro do próprio corpo JSON (ex: Hotmart
  // manda "hottok" no payload), ou um header HTTP — configure só um dos dois.
  secretBodyField?: string;
  secretHeader?: string;
  secretValue?: string;
  // Caminho ponto-a-ponto até os campos relevantes no JSON recebido, ex:
  // "data.buyer.email" ou "event".
  emailPath: string;
  statusPath: string;
  activateValues: string[];
  deactivateValues: string[];
  // Opcional: campo que indica o plano/produto comprado, e o mapeamento de
  // cada valor pro plano do Zelo.
  planPath?: string;
  planMap?: Record<string, UserPlan>;
  createdAt: string;
};

const FILE = path.join(process.cwd(), "data", "billing-webhooks.json");

function load(): BillingWebhookConfig[] {
  try {
    if (!existsSync(FILE)) return [];
    const raw = JSON.parse(readFileSync(FILE, "utf-8")) as BillingWebhookConfig[];
    return raw.map(c => ({ ...c, secretValue: decryptField(c.secretValue) }));
  } catch { return []; }
}

function save(configs: BillingWebhookConfig[]) {
  writeJSONAtomic(FILE, configs.map(c => ({ ...c, secretValue: encryptField(c.secretValue) })));
}

export function getBillingWebhooks(): BillingWebhookConfig[] {
  return load();
}

export function getBillingWebhookById(id: string): BillingWebhookConfig | null {
  return load().find(c => c.id === id) ?? null;
}

export function createBillingWebhook(data: Omit<BillingWebhookConfig, "id" | "createdAt">): BillingWebhookConfig {
  const configs = load();
  const cfg: BillingWebhookConfig = { ...data, id: randomUUID(), createdAt: new Date().toISOString() };
  configs.push(cfg);
  save(configs);
  return cfg;
}

export function updateBillingWebhook(id: string, patch: Partial<Omit<BillingWebhookConfig, "id" | "createdAt">>): BillingWebhookConfig | null {
  const configs = load();
  const idx = configs.findIndex(c => c.id === id);
  if (idx < 0) return null;
  configs[idx] = { ...configs[idx], ...patch };
  save(configs);
  return configs[idx];
}

export function deleteBillingWebhook(id: string): void {
  save(load().filter(c => c.id !== id));
}

/** Presets — ponto de partida, não fonte de verdade. O admin confere e
 *  ajusta com um payload de teste real antes de ativar pra valer. */
export const BILLING_WEBHOOK_PRESETS: Record<string, Omit<BillingWebhookConfig, "id" | "createdAt" | "active" | "secretValue">> = {
  hotmart: {
    label: "Hotmart",
    secretBodyField: "hottok",
    emailPath: "data.buyer.email",
    statusPath: "event",
    activateValues: ["PURCHASE_APPROVED", "PURCHASE_COMPLETE", "SUBSCRIPTION_RENEWED"],
    deactivateValues: ["PURCHASE_CANCELED", "PURCHASE_REFUNDED", "PURCHASE_CHARGEBACK", "PURCHASE_EXPIRED", "SUBSCRIPTION_CANCELLATION"],
    planPath: "data.product.id",
    planMap: {},
  },
  kiwify: {
    label: "Kiwify",
    secretBodyField: "token",
    emailPath: "Customer.email",
    statusPath: "webhook_event_type",
    activateValues: ["compra_aprovada", "subscription_renewed"],
    deactivateValues: ["compra_reembolsada", "chargeback", "subscription_canceled"],
    planPath: "Product.product_id",
    planMap: {},
  },
};

function getByPath(obj: unknown, pathStr: string): unknown {
  if (!pathStr) return undefined;
  return pathStr.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

export type BillingWebhookResult =
  | { ok: true; action: "activated" | "deactivated" | "plan_changed" | "ignored"; email?: string; detail?: string }
  | { ok: false; error: string };

/** Processa um payload já autenticado — separado da checagem de auth pra
 *  poder ser usado também no "testar mapeamento" do admin (dry run). */
export function evaluateBillingWebhook(cfg: BillingWebhookConfig, body: unknown, dryRun = false): BillingWebhookResult {
  const email = getByPath(body, cfg.emailPath);
  const status = getByPath(body, cfg.statusPath);

  if (typeof email !== "string" || !email) {
    return { ok: false, error: `Não achei o email em "${cfg.emailPath}" — confira o caminho do campo.` };
  }
  if (typeof status !== "string" || !status) {
    return { ok: false, error: `Não achei o status em "${cfg.statusPath}" — confira o caminho do campo.` };
  }

  const user = getUserByEmail(email);
  if (!user) return { ok: false, error: `Nenhum cliente do Zelo com o email "${email}".` };

  const isActivate = cfg.activateValues.includes(status);
  const isDeactivate = cfg.deactivateValues.includes(status);

  if (!isActivate && !isDeactivate) {
    return { ok: true, action: "ignored", email, detail: `status "${status}" não está mapeado pra nenhuma ação` };
  }

  if (cfg.planPath && cfg.planMap) {
    const planRaw = getByPath(body, cfg.planPath);
    const mappedPlan = typeof planRaw === "string" ? cfg.planMap[planRaw] : undefined;
    if (mappedPlan && !dryRun) updateUser(user.id, { plan: mappedPlan });
    if (mappedPlan && dryRun) return { ok: true, action: "plan_changed", email, detail: `plano seria trocado pra "${mappedPlan}"` };
  }

  if (isActivate) {
    if (!dryRun) activateUser(user.id);
    return { ok: true, action: "activated", email };
  }
  if (!dryRun) deactivateUser(user.id);
  return { ok: true, action: "deactivated", email };
}

export function verifyBillingWebhookAuth(cfg: BillingWebhookConfig, body: unknown, headers: Headers): boolean {
  if (!cfg.secretValue) return false; // sem secret configurado, não autentica ninguém — mais seguro que aceitar tudo
  if (cfg.secretHeader) return headers.get(cfg.secretHeader) === cfg.secretValue;
  if (cfg.secretBodyField) return getByPath(body, cfg.secretBodyField) === cfg.secretValue;
  return false;
}
