import { randomUUID } from "crypto";
import { getSupabase } from "./supabase";
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

type Row = {
  id: string;
  label: string;
  active: boolean;
  secret_body_field: string | null;
  secret_header: string | null;
  secret_value: string | null;
  email_path: string;
  status_path: string;
  activate_values: string[];
  deactivate_values: string[];
  plan_path: string | null;
  plan_map: Record<string, UserPlan> | null;
  created_at: string;
};

function fromRow(r: Row): BillingWebhookConfig {
  return {
    id: r.id,
    label: r.label,
    active: r.active,
    secretBodyField: r.secret_body_field ?? undefined,
    secretHeader: r.secret_header ?? undefined,
    secretValue: decryptField(r.secret_value ?? undefined),
    emailPath: r.email_path,
    statusPath: r.status_path,
    activateValues: r.activate_values ?? [],
    deactivateValues: r.deactivate_values ?? [],
    planPath: r.plan_path ?? undefined,
    planMap: r.plan_map ?? undefined,
    createdAt: r.created_at,
  };
}

function toRowPatch(patch: Partial<Omit<BillingWebhookConfig, "id" | "createdAt">>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.label !== undefined) row.label = patch.label;
  if (patch.active !== undefined) row.active = patch.active;
  if (patch.secretBodyField !== undefined) row.secret_body_field = patch.secretBodyField;
  if (patch.secretHeader !== undefined) row.secret_header = patch.secretHeader;
  if (patch.secretValue !== undefined) row.secret_value = encryptField(patch.secretValue);
  if (patch.emailPath !== undefined) row.email_path = patch.emailPath;
  if (patch.statusPath !== undefined) row.status_path = patch.statusPath;
  if (patch.activateValues !== undefined) row.activate_values = patch.activateValues;
  if (patch.deactivateValues !== undefined) row.deactivate_values = patch.deactivateValues;
  if (patch.planPath !== undefined) row.plan_path = patch.planPath;
  if (patch.planMap !== undefined) row.plan_map = patch.planMap;
  return row;
}

export async function getBillingWebhooks(): Promise<BillingWebhookConfig[]> {
  const { data } = await getSupabase().from("billing_webhooks").select("*").order("created_at", { ascending: true });
  return (data as Row[] ?? []).map(fromRow);
}

export async function getBillingWebhookById(id: string): Promise<BillingWebhookConfig | null> {
  const { data } = await getSupabase().from("billing_webhooks").select("*").eq("id", id).maybeSingle();
  return data ? fromRow(data as Row) : null;
}

export async function createBillingWebhook(data: Omit<BillingWebhookConfig, "id" | "createdAt">): Promise<BillingWebhookConfig> {
  const cfg: BillingWebhookConfig = { ...data, id: randomUUID(), createdAt: new Date().toISOString() };
  await getSupabase().from("billing_webhooks").insert({
    id: cfg.id,
    label: cfg.label,
    active: cfg.active,
    secret_body_field: cfg.secretBodyField ?? null,
    secret_header: cfg.secretHeader ?? null,
    secret_value: encryptField(cfg.secretValue),
    email_path: cfg.emailPath,
    status_path: cfg.statusPath,
    activate_values: cfg.activateValues,
    deactivate_values: cfg.deactivateValues,
    plan_path: cfg.planPath ?? null,
    plan_map: cfg.planMap ?? null,
    created_at: cfg.createdAt,
  });
  return cfg;
}

export async function updateBillingWebhook(id: string, patch: Partial<Omit<BillingWebhookConfig, "id" | "createdAt">>): Promise<BillingWebhookConfig | null> {
  const { data } = await getSupabase().from("billing_webhooks").update(toRowPatch(patch)).eq("id", id).select().maybeSingle();
  return data ? fromRow(data as Row) : null;
}

export async function deleteBillingWebhook(id: string): Promise<void> {
  await getSupabase().from("billing_webhooks").delete().eq("id", id);
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
export async function evaluateBillingWebhook(cfg: BillingWebhookConfig, body: unknown, dryRun = false): Promise<BillingWebhookResult> {
  const email = getByPath(body, cfg.emailPath);
  const status = getByPath(body, cfg.statusPath);

  if (typeof email !== "string" || !email) {
    return { ok: false, error: `Não achei o email em "${cfg.emailPath}" — confira o caminho do campo.` };
  }
  if (typeof status !== "string" || !status) {
    return { ok: false, error: `Não achei o status em "${cfg.statusPath}" — confira o caminho do campo.` };
  }

  const user = await getUserByEmail(email);
  if (!user) return { ok: false, error: `Nenhum cliente do Zelo com o email "${email}".` };

  const isActivate = cfg.activateValues.includes(status);
  const isDeactivate = cfg.deactivateValues.includes(status);

  if (!isActivate && !isDeactivate) {
    return { ok: true, action: "ignored", email, detail: `status "${status}" não está mapeado pra nenhuma ação` };
  }

  if (cfg.planPath && cfg.planMap) {
    const planRaw = getByPath(body, cfg.planPath);
    const mappedPlan = typeof planRaw === "string" ? cfg.planMap[planRaw] : undefined;
    if (mappedPlan && !dryRun) await updateUser(user.id, { plan: mappedPlan });
    if (mappedPlan && dryRun) return { ok: true, action: "plan_changed", email, detail: `plano seria trocado pra "${mappedPlan}"` };
  }

  if (isActivate) {
    if (!dryRun) await activateUser(user.id);
    return { ok: true, action: "activated", email };
  }
  if (!dryRun) await deactivateUser(user.id);
  return { ok: true, action: "deactivated", email };
}

export function verifyBillingWebhookAuth(cfg: BillingWebhookConfig, body: unknown, headers: Headers): boolean {
  if (!cfg.secretValue) return false; // sem secret configurado, não autentica ninguém — mais seguro que aceitar tudo
  if (cfg.secretHeader) return headers.get(cfg.secretHeader) === cfg.secretValue;
  if (cfg.secretBodyField) return getByPath(body, cfg.secretBodyField) === cfg.secretValue;
  return false;
}
