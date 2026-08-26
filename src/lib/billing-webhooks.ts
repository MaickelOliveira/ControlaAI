import { randomUUID } from "crypto";
import { getSupabase } from "./supabase";
import { encryptField, decryptField } from "./crypto-store";
import { getUserByEmail, activateUser, createPaidUser, deactivateUser, updateUser, type UserPlan, type UserLocale } from "./users";
import { createPasswordSetupLink } from "./password-reset";
import { sendFirstAccessLinkEmail } from "./brevo";
import { sendWelcomeTemplate } from "./whatsapp";

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
  // Autenticação: ou um campo dentro do próprio corpo JSON, ou um header
  // HTTP (ex: a Hotmart v2 envia o Hottok em X-HOTMART-HOTTOK).
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
  // Mesma ideia do plano: qual campo do payload identifica o produto/checkout
  // comprado, mapeado pro idioma da conta — precisa de um produto/checkout
  // separado por idioma na plataforma de venda pra isso fazer sentido.
  localePath?: string;
  localeMap?: Record<string, UserLocale>;
  createdAt: string;
  // Última requisição recebida de verdade nessa URL, autenticada ou não —
  // guardado pra dar visibilidade real do que a plataforma de venda está
  // mandando, sem precisar adivinhar o formato ou vasculhar log de servidor.
  lastAttempt?: WebhookAttempt;
};

export type WebhookAttempt = {
  at: string;
  wasActive: boolean;
  authOk: boolean;
  body: unknown;
  result?: BillingWebhookResult;
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
  locale_path: string | null;
  locale_map: Record<string, UserLocale> | null;
  created_at: string;
  last_attempt: WebhookAttempt | null;
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
    localePath: r.locale_path ?? undefined,
    localeMap: r.locale_map ?? undefined,
    createdAt: r.created_at,
    lastAttempt: r.last_attempt ?? undefined,
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
  if (patch.localePath !== undefined) row.locale_path = patch.localePath;
  if (patch.localeMap !== undefined) row.locale_map = patch.localeMap;
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

/** Grava a última requisição recebida de verdade, autenticada ou não —
 *  inclusive quando a integração está desativada (esse é o caso mais fácil
 *  de passar despercebido: a plataforma de venda manda o webhook, recebe
 *  200 OK, o admin acha que "testou e funcionou", mas nada acontece porque
 *  ninguém tinha ligado a integração ainda). Best-effort: nunca deve
 *  derrubar o processamento do webhook por causa de erro aqui. */
export async function recordWebhookAttempt(id: string, attempt: WebhookAttempt): Promise<void> {
  try {
    await getSupabase().from("billing_webhooks").update({ last_attempt: attempt }).eq("id", id);
  } catch (e) {
    console.error("[billing-webhook] falha ao gravar last_attempt:", e);
  }
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
    locale_path: cfg.localePath ?? null,
    locale_map: cfg.localeMap ?? null,
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
    secretHeader: "X-HOTMART-HOTTOK",
    emailPath: "data.buyer.email",
    statusPath: "event",
    activateValues: ["PURCHASE_APPROVED", "PURCHASE_COMPLETE", "SUBSCRIPTION_RENEWED"],
    deactivateValues: ["PURCHASE_CANCELED", "PURCHASE_REFUNDED", "PURCHASE_CHARGEBACK", "PURCHASE_EXPIRED", "SUBSCRIPTION_CANCELLATION"],
    planPath: "data.product.id",
    planMap: {},
    localePath: "data.product.id",
    localeMap: {},
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
    localePath: "Product.product_id",
    localeMap: {},
  },
};

function getByPath(obj: unknown, pathStr: string): unknown {
  if (!pathStr) return undefined;
  return pathStr.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

function firstString(body: unknown, paths: string[]): string | undefined {
  for (const path of paths) {
    const value = getByPath(body, path);
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

export type BillingWebhookResult =
  | { ok: true; action: "activated" | "deactivated" | "plan_changed" | "ignored"; email?: string; detail?: string }
  | { ok: false; error: string };

/** Processa um payload já autenticado — separado da checagem de auth pra
 *  poder ser usado também no "testar mapeamento" do admin (dry run). */
export async function evaluateBillingWebhook(cfg: BillingWebhookConfig, body: unknown, dryRun = false): Promise<BillingWebhookResult> {
  // Eventos de COMPRA (Hotmart) trazem o email em "data.buyer.email"; eventos
  // de ASSINATURA (ex: SUBSCRIPTION_CANCELLATION, SUBSCRIPTION_RENEWED) vêm
  // com um formato de payload DIFERENTE, sem "buyer" — o email fica em
  // "data.subscriber.email". Sem esse fallback, todo evento de assinatura
  // falhava silenciosamente em achar o email e nunca cancelava/renovava
  // ninguém, mesmo com o "emailPath" configurado certo pra compras.
  const email = getByPath(body, cfg.emailPath) ?? getByPath(body, "data.subscriber.email");
  const status = getByPath(body, cfg.statusPath);

  if (typeof email !== "string" || !email) {
    return { ok: false, error: `Não achei o email em "${cfg.emailPath}" (nem em "data.subscriber.email") — confira o caminho do campo.` };
  }
  if (typeof status !== "string" || !status) {
    return { ok: false, error: `Não achei o status em "${cfg.statusPath}" — confira o caminho do campo.` };
  }

  const isActivate = cfg.activateValues.includes(status);
  const isDeactivate = cfg.deactivateValues.includes(status);

  if (!isActivate && !isDeactivate) {
    return { ok: true, action: "ignored", email, detail: `status "${status}" não está mapeado pra nenhuma ação` };
  }

  let mappedPlan: UserPlan | undefined;
  if (cfg.planPath && cfg.planMap) {
    const planRaw = getByPath(body, cfg.planPath);
    mappedPlan = typeof planRaw === "string" || typeof planRaw === "number" ? cfg.planMap[String(planRaw)] : undefined;
  }

  let mappedLocale: UserLocale | undefined;
  if (cfg.localePath && cfg.localeMap) {
    const localeRaw = getByPath(body, cfg.localePath);
    mappedLocale = typeof localeRaw === "string" || typeof localeRaw === "number" ? cfg.localeMap[String(localeRaw)] : undefined;
  }

  let user = await getUserByEmail(email);
  if (!user && !isActivate) return { ok: true, action: "ignored", email, detail: "cliente ainda não possui conta" };
  if (!user && dryRun) return { ok: true, action: "activated", email, detail: "conta paga seria criada e o acesso enviado por e-mail" };
  if (!user) {
    const name = firstString(body, ["data.buyer.name", "data.buyer.first_name", "data.subscriber.name", "Customer.full_name", "Customer.first_name"]) || email.split("@")[0];
    const phone = firstString(body, ["data.buyer.checkout_phone", "data.buyer.phone", "Customer.mobile", "Customer.phone"]);
    user = await createPaidUser({ name, email, phone, plan: mappedPlan, locale: mappedLocale });
    let setupId: string | undefined;
    try {
      const setup = await createPasswordSetupLink(user.id);
      setupId = setup.id;
      await sendFirstAccessLinkEmail({ email: user.email, name: user.name, setupId: setup.id, locale: user.locale });
    } catch (error) {
      console.error("[billing-webhook] conta criada, mas o e-mail de acesso falhou", error);
    }
    // Mesmo link/token do e-mail, também por WhatsApp — independente do
    // e-mail ter falhado ou não, e só se o webhook trouxe telefone.
    if (setupId && user.phone) {
      try {
        await sendWelcomeTemplate(user.phone, user.locale);
      } catch (error) {
        console.error("[billing-webhook] conta criada, mas a mensagem de boas-vindas por WhatsApp falhou", error);
      }
    }
    return { ok: true, action: "activated", email, detail: "conta paga criada e acesso enviado por e-mail" };
  }

  if (mappedPlan && !dryRun) await updateUser(user.id, { plan: mappedPlan });
  if (mappedPlan && dryRun) return { ok: true, action: "plan_changed", email, detail: `plano seria trocado pra "${mappedPlan}"` };

  if (isActivate) {
    if (!dryRun) await activateUser(user.id);
    return { ok: true, action: "activated", email };
  }
  if (!dryRun) await deactivateUser(user.id);
  return { ok: true, action: "deactivated", email };
}

export function verifyBillingWebhookAuth(cfg: BillingWebhookConfig, body: unknown, headers: Headers): boolean {
  if (!cfg.secretValue) return false; // sem secret configurado, não autentica ninguém — mais seguro que aceitar tudo
  if (cfg.secretHeader && headers.get(cfg.secretHeader) === cfg.secretValue) return true;
  if (cfg.secretBodyField && getByPath(body, cfg.secretBodyField) === cfg.secretValue) return true;

  // O Hottok da Hotmart aparece no header X-HOTMART-HOTTOK OU no campo
  // "hottok" do corpo, dependendo da conta/versão do vendedor na Hotmart —
  // não é sempre um só, mesmo dentro da v2 (relatos de comerciantes variam).
  // Sem isso, uma conta configurada só com o campo "errado" (header quando a
  // Hotmart manda no corpo, ou vice-versa) rejeita a compra silenciosamente,
  // mesmo com o token certo. Checa os dois lugares sempre que a config
  // parecer ser Hotmart, sem exigir que o admin acerte de primeira qual dos
  // dois a própria conta Hotmart dele usa.
  const looksLikeHotmart = cfg.secretHeader?.toUpperCase() === "X-HOTMART-HOTTOK" || cfg.secretBodyField?.toLowerCase() === "hottok";
  if (looksLikeHotmart) {
    if (headers.get("X-HOTMART-HOTTOK") === cfg.secretValue) return true;
    if (getByPath(body, "hottok") === cfg.secretValue) return true;
  }
  return false;
}
