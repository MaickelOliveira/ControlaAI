import { randomUUID } from "crypto";
import { getSupabase } from "./supabase";
import { encryptField, decryptField } from "./crypto-store";
import { getUserByEmail, getUsers, activateUser, createPaidUser, deactivateUser, updateUser, type UserPlan, type UserLocale } from "./users";
import { createPasswordSetupLink } from "./password-reset";
import { sendFirstAccessLinkEmail } from "./brevo";
import { sendWelcomeTemplate } from "./whatsapp";
import { normalizeWhatsAppPhone } from "./phone";
import { checkoutLocaleFromIdentifiers } from "./checkout-markets";

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
  // Últimos eventos recebidos (mais novo primeiro), sem o corpo completo.
  // Vive dentro do mesmo JSON de last_attempt para não exigir migração.
  history?: WebhookHistoryEntry[];
};

export type WebhookHistoryEntry = {
  at: string;
  event?: string;
  email?: string;
  authOk: boolean;
  outcome: string;
};

const WEBHOOK_HISTORY_LIMIT = 100;

type DiagnosticConfig = Pick<BillingWebhookConfig, "emailPath" | "statusPath" | "planPath" | "localePath" | "secretBodyField" | "secretValue"> & { diagnosticSecrets?: readonly string[]; redactDiagnosticText?: boolean };
const CREDENTIAL_FIELD = /(?:token|secret|password|passwd|credential|authorization|api[-_]?key|hottok)/i;

/** Legacy bodies may contain a previous credential after its configured value changed. */
function bodyDiagnosticConfig(body: unknown, cfg?: DiagnosticConfig): DiagnosticConfig | undefined {
  if (!cfg) return cfg;
  const secrets = new Set<string>(cfg.secretValue ? [cfg.secretValue] : []);
  let visited = 0, truncated = false;
  function scan(value: unknown, sensitive = false, depth = 0): void {
    if (++visited > 5_000 || depth > 16 || secrets.size > 128) { truncated = true; return; }
    if (typeof value === "string") { if (sensitive && value) secrets.add(value); return; }
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (truncated) break;
      scan(child, sensitive || CREDENTIAL_FIELD.test(key), depth + 1);
    }
  }
  scan(body);
  if (cfg.secretBodyField) scan(getByPath(body, cfg.secretBodyField), true);
  return { ...cfg, diagnosticSecrets: [...secrets].sort((a, b) => b.length - a.length), redactDiagnosticText: truncated };
}

function diagnosticText(value: unknown, cfg?: DiagnosticConfig): string | undefined {
  if (typeof value !== "string") return undefined;
  if (cfg?.redactDiagnosticText) return "[oculto]";
  let safe = value;
  for (const secret of cfg?.diagnosticSecrets ?? (cfg?.secretValue ? [cfg.secretValue] : [])) safe = safe.replaceAll(secret, "[oculto]");
  return safe.slice(0, 500);
}

/** Diagnostics retain mapped scalar fields, never a copy of a provider payload. */
function diagnosticBody(body: unknown, cfg?: DiagnosticConfig): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  if (!cfg) return safe;
  for (const path of [cfg.emailPath, cfg.statusPath, cfg.planPath, cfg.localePath, "data.subscriber.email"]) {
    if (!path || path.length > 200) continue;
    const parts = path.split(".");
    if (parts.length > 8 || parts.some(part => !/^[\w-]{1,64}$/.test(part) || /^(?:__proto__|prototype|constructor)$/i.test(part)
      || CREDENTIAL_FIELD.test(part))) continue;
    if (cfg.secretBodyField && (path === cfg.secretBodyField || path.startsWith(`${cfg.secretBodyField}.`))) continue;
    const value = getByPath(body, path);
    const scalar = typeof value === "string" ? diagnosticText(value, cfg)
      : typeof value === "number" && Number.isFinite(value) || typeof value === "boolean" ? value : undefined;
    if (scalar === undefined) continue;
    let node = safe;
    for (const part of parts.slice(0, -1)) {
      if (!node[part] || typeof node[part] !== "object") node[part] = {};
      node = node[part] as Record<string, unknown>;
    }
    node[parts[parts.length - 1]] = scalar;
  }
  return safe;
}

export function billingWebhookAdminResult(result: BillingWebhookResult, cfg?: DiagnosticConfig): BillingWebhookResult {
  return result.ok ? { ok: true, action: result.action, email: diagnosticText(result.email, cfg), detail: diagnosticText(result.detail, cfg) }
    : { ok: false, error: diagnosticText(result.error, cfg) ?? "Falha no processamento", retryable: result.retryable === true };
}

function diagnosticAttempt(attempt: WebhookAttempt, cfg?: DiagnosticConfig): WebhookAttempt {
  cfg = bodyDiagnosticConfig(attempt.body, cfg);
  const safeResult = attempt.result ? billingWebhookAdminResult(attempt.result, cfg) : undefined;
  return {
    at: diagnosticText(attempt.at, cfg) ?? "", wasActive: attempt.wasActive === true, authOk: attempt.authOk === true,
    body: diagnosticBody(attempt.body, cfg), ...(safeResult ? { result: safeResult } : {}),
    ...(Array.isArray(attempt.history) ? { history: attempt.history.slice(0, WEBHOOK_HISTORY_LIMIT).map(entry => ({
      at: diagnosticText(entry.at, cfg) ?? "", authOk: entry.authOk === true,
      event: diagnosticText(entry.event, cfg), email: diagnosticText(entry.email, cfg), outcome: diagnosticText(entry.outcome, cfg) ?? "",
    })) } : {}),
  };
}

/** Applies to reads and mutation responses, including diagnostics saved before hardening. */
export function billingWebhookAdminView(cfg: BillingWebhookConfig): BillingWebhookConfig {
  return { ...cfg, activateValues: cfg.activateValues.filter(value => value !== "PURCHASE_COMPLETE"), secretValue: cfg.secretValue ? "••••••••" : "", ...(cfg.lastAttempt ? { lastAttempt: diagnosticAttempt(cfg.lastAttempt, cfg) } : {}) };
}

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
export async function recordWebhookAttempt(id: string, attempt: WebhookAttempt, cfg?: DiagnosticConfig & Pick<BillingWebhookConfig, "lastAttempt">): Promise<void> {
  try {
    const event = cfg ? getByPath(attempt.body, cfg.statusPath) : undefined;
    const email = cfg ? (getByPath(attempt.body, cfg.emailPath) ?? getByPath(attempt.body, "data.subscriber.email")) : undefined;
    const outcome = !attempt.wasActive ? "integração desativada"
      : !attempt.authOk ? "autenticação falhou"
        : !attempt.result ? "sem resultado"
          : attempt.result.ok ? `${attempt.result.action}${attempt.result.detail ? ` — ${attempt.result.detail}` : ""}`
            : `erro: ${attempt.result.error}`;
    const entry: WebhookHistoryEntry = {
      at: attempt.at,
      ...(typeof event === "string" ? { event } : {}),
      ...(typeof email === "string" ? { email } : {}),
      authOk: attempt.authOk,
      outcome,
    };
    const history = [entry, ...(cfg?.lastAttempt?.history ?? [])].slice(0, WEBHOOK_HISTORY_LIMIT);
    await getSupabase().from("billing_webhooks").update({ last_attempt: diagnosticAttempt({ ...attempt, history }, cfg) }).eq("id", id);
  } catch  {
    console.error("[billing-webhook] falha ao gravar last_attempt:");
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
    activateValues: ["PURCHASE_APPROVED", "SUBSCRIPTION_RENEWED"],
    deactivateValues: ["PURCHASE_DELAYED", "PURCHASE_PROTEST", "PURCHASE_CANCELED", "PURCHASE_REFUNDED", "PURCHASE_CHARGEBACK", "PURCHASE_EXPIRED", "SUBSCRIPTION_CANCELLATION"],
    planPath: "data.product.id",
    planMap: {},
    localePath: "data.product.id",
    localeMap: {
      "107497176": "es",
      "T107497176B": "es",
    },
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

function firstScalarString(body: unknown, paths: string[]): string | undefined {
  for (const path of paths) {
    const value = getByPath(body, path);
    if ((typeof value === "string" || typeof value === "number") && String(value).trim()) {
      return String(value).trim();
    }
  }
  return undefined;
}

const CHECKOUT_COUNTRY_PATHS = [
  "data.buyer.address.country_iso",
  "data.buyer.address.country",
  "data.buyer.country_iso",
  "data.buyer.country",
  "data.purchase.checkout_country.iso",
  "data.purchase.checkout_country",
  "data.checkout_country.iso",
  "data.checkout_country",
  "address_country_ISO",
  "Customer.address.country_iso",
  "Customer.address.country",
];

function localeFromCountry(country?: string): UserLocale | undefined {
  if (!country) return undefined;
  const normalized = country.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  if (["br", "bra", "brasil", "brazil"].includes(normalized)) return "pt-BR";
  if (["pt", "prt", "portugal"].includes(normalized)) return "pt-PT";
  return undefined;
}

function localeFromBuyerPreference(body: unknown): UserLocale | undefined {
  const locale = firstScalarString(body, ["data.buyer.locale", "data.subscriber.locale", "Customer.locale"])
    ?.replace("_", "-")
    .toLowerCase();
  if (locale === "pt-br" || locale === "pt") return "pt-BR";
  if (locale === "pt-pt") return "pt-PT";
  if (locale?.startsWith("es")) return "es";
  return undefined;
}

function isBrazilianCheckoutPhone(body: unknown): boolean {
  const phone = firstScalarString(body, [
    "data.buyer.checkout_phone",
    "data.buyer.phone",
    "phone_checkout_number",
    "phone_number",
  ]);
  if (!phone) return false;
  return /^55\d{10,11}$/.test(phone.replace(/\D/g, ""));
}

/** Resolve o idioma da conta sem confundir o mercado brasileiro com o
 * espanhol. País e telefone do comprador prevalecem sobre produto/oferta:
 * mesmo que um brasileiro abra por engano o checkout internacional, a conta
 * e as mensagens continuam em pt-BR. */
export function inferCheckoutLocale(body: unknown): UserLocale | undefined {
  const countryLocale = localeFromCountry(firstScalarString(body, CHECKOUT_COUNTRY_PATHS));
  if (countryLocale) return countryLocale;
  if (isBrazilianCheckoutPhone(body)) return "pt-BR";

  const buyerLocale = localeFromBuyerPreference(body);
  if (buyerLocale) return buyerLocale;

  const product = firstScalarString(body, ["data.product.id", "product.id", "prod"]);
  const offer = firstScalarString(body, ["data.purchase.offer.code", "data.offer.code", "off"]);
  const source = firstScalarString(body, [
    "data.purchase.tracking.source_sck",
    "data.purchase.tracking.source",
    "data.purchase.origin.src",
    "data.purchase.origin.sck",
    "sales_source",
    "src",
    "sck",
  ]);
  return checkoutLocaleFromIdentifiers(product, offer, source);
}

/** Extrai e normaliza o telefone do checkout para E.164. A Hotmart informa
 * o DDI em vendas internacionais; se alguma plataforma mandar só o número
 * local, o país ISO do checkout completa o DDI sem presumir Brasil. */
export function normalizedCheckoutPhone(body: unknown): string | undefined {
  let phone = firstScalarString(body, [
    "data.buyer.checkout_phone",
    "data.buyer.phone",
    "Customer.mobile",
    "Customer.phone",
    "phone_checkout_number",
    "phone_number",
  ]);
  if (!phone) return undefined;

  const countryIso = firstScalarString(body, CHECKOUT_COUNTRY_PATHS);

  // Na Hotmart, o DDD brasileiro pode vir separado do telefone.
  if (countryIso?.toUpperCase() === "BR") {
    const areaCode = firstScalarString(body, [
      "data.buyer.checkout_phone_code",
      "phone_checkout_local_code",
      "phone_local_code",
    ]);
    const phoneDigits = phone.replace(/\D/g, "");
    const areaDigits = areaCode?.replace(/\D/g, "") ?? "";
    if (areaDigits && phoneDigits.length <= 9) phone = `${areaDigits}${phoneDigits}`;
  }

  const normalized = normalizeWhatsAppPhone(phone, countryIso);
  return normalized || undefined;
}

/** Momento em que o provedor gerou o evento (Hotmart: "creation_date", em ms). */
function billingEventTimeMs(body: unknown): number | null {
  const raw = getByPath(body, "creation_date");
  const value = typeof raw === "number" ? raw : typeof raw === "string" && /^\d+$/.test(raw.trim()) ? Number(raw) : NaN;
  if (!Number.isFinite(value) || value <= 0) return null;
  return value < 1e12 ? value * 1000 : value;
}

/** Evento de ativação mais antigo que a última desativação do cliente: é
 *  reenvio ou entrega atrasada (Hotmart reenvia quando demoramos a responder)
 *  e não pode desfazer um reembolso/chargeback já processado. Uma recompra
 *  de verdade gera evento NOVO, com data posterior, e passa normalmente. */
export function isStaleActivation(user: { status: string; deactivatedAt?: string }, body: unknown): boolean {
  if (user.status !== "inactive" || !user.deactivatedAt) return false;
  const eventAt = billingEventTimeMs(body);
  const deactivatedAt = new Date(user.deactivatedAt).getTime();
  return eventAt !== null && Number.isFinite(deactivatedAt) && eventAt <= deactivatedAt;
}

/** Eventos que SEMPRE tiram o acesso, mesmo que a lista salva no banco (que
 *  vem do preset da época da criação) não os tenha: pagamento atrasado,
 *  pedido de reembolso, reembolso, chargeback, cancelamento e expiração. */
const ALWAYS_DEACTIVATE_STATUSES = [
  "PURCHASE_DELAYED",
  "PURCHASE_PROTEST",
  "PURCHASE_REFUNDED",
  "PURCHASE_CHARGEBACK",
  "PURCHASE_CANCELED",
  "PURCHASE_EXPIRED",
  "SUBSCRIPTION_CANCELLATION",
];

export function classifyBillingStatus(
  cfg: Pick<BillingWebhookConfig, "activateValues" | "deactivateValues">,
  status: string,
): { isActivate: boolean; isDeactivate: boolean } {
  const forced = ALWAYS_DEACTIVATE_STATUSES.includes(status);
  return {
    isDeactivate: forced || cfg.deactivateValues.includes(status),
    // PURCHASE_COMPLETE can arrive days after PURCHASE_APPROVED, even after
    // the subscription was cancelled. The original approval already grants access.
    isActivate: !forced && status !== "PURCHASE_COMPLETE" && cfg.activateValues.includes(status),
  };
}

function phoneTail(phone: string | undefined): string {
  const digits = (phone || "").replace(/\D/g, "");
  return digits.length >= 8 ? digits.slice(-10) : "";
}

/** Compra com e-mail NOVO feita pelo telefone de um cliente já desativado
 *  (reembolso, chargeback, cancelamento): não cria conta nem libera acesso,
 *  senão trocar de e-mail contornava a desativação. Recompra com o MESMO
 *  e-mail continua reativando normalmente. */
export function isBlockedByInactivePhone(
  phone: string | undefined,
  users: { status: string; phone: string }[],
): boolean {
  const tail = phoneTail(phone);
  return !!tail && users.some(u => u.status === "inactive" && phoneTail(u.phone) === tail);
}

export type BillingWebhookResult =
  | { ok: true; action: "activated" | "deactivated" | "plan_changed" | "ignored"; email?: string; detail?: string }
  | { ok: false; error: string; retryable?: boolean };

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

  const { isActivate, isDeactivate } = classifyBillingStatus(cfg, status);

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
  // A identificação segura do comprador precisa prevalecer inclusive sobre
  // localeMap antigo salvo no banco, que pode mapear o produto internacional
  // para espanhol sem saber que o país/telefone da venda é brasileiro.
  mappedLocale = inferCheckoutLocale(body) ?? mappedLocale;

  let user = await getUserByEmail(email);
  if (!user && !isActivate) return { ok: true, action: "ignored", email, detail: "cliente ainda não possui conta" };
  if (!user && isActivate && isBlockedByInactivePhone(normalizedCheckoutPhone(body), await getUsers())) {
    return { ok: true, action: "ignored", email, detail: "telefone pertence a um cliente desativado (reembolso/cancelamento); conta não criada" };
  }
  if (!user && dryRun) return { ok: true, action: "activated", email, detail: "conta paga seria criada e o acesso enviado por e-mail" };
  if (!user) {
    const name = firstString(body, ["data.buyer.name", "data.buyer.first_name", "data.subscriber.name", "Customer.full_name", "Customer.first_name"]) || email.split("@")[0];
    const phone = normalizedCheckoutPhone(body);
    user = await createPaidUser({ name, email, phone, plan: mappedPlan, locale: mappedLocale });
    let setupId: string | undefined;
    try {
      const setup = await createPasswordSetupLink(user.id);
      setupId = setup.id;
      await sendFirstAccessLinkEmail({ email: user.email, name: user.name, setupId: setup.id, locale: user.locale });
    } catch {
      console.error("[billing-webhook] conta criada, mas o e-mail de acesso falhou");
    }
    // Mesmo link/token do e-mail, também por WhatsApp — independente do
    // e-mail ter falhado ou não, e só se o webhook trouxe telefone.
    if (setupId && user.phone) {
      try {
        await sendWelcomeTemplate(user.phone, user.locale);
      } catch {
        console.error("[billing-webhook] conta criada, mas a mensagem de boas-vindas por WhatsApp falhou");
      }
    }
    return { ok: true, action: "activated", email, detail: "conta paga criada e acesso enviado por e-mail" };
  }

  if ((mappedPlan || mappedLocale) && !dryRun) {
    const updated = await updateUser(user.id, {
      ...(mappedPlan ? { plan: mappedPlan } : {}),
      ...(mappedLocale ? { locale: mappedLocale } : {}),
    });
    if (updated) user = updated;
  }
  if (mappedPlan && dryRun) return { ok: true, action: "plan_changed", email, detail: `plano seria trocado pra "${mappedPlan}"` };

  if (isActivate) {
    if (isStaleActivation(user, body)) {
      return { ok: true, action: "ignored", email, detail: "evento de ativação anterior à desativação do cliente (reenvio ou atraso); acesso mantido bloqueado" };
    }
    if (!dryRun && !await activateUser(user.id)) {
      return { ok: false, error: `Não consegui ativar ${email} no banco`, retryable: true };
    }
    return { ok: true, action: "activated", email };
  }
  if (!dryRun && !await deactivateUser(user.id)) {
    return { ok: false, error: `Não consegui desativar ${email} no banco — o acesso continua liberado`, retryable: true };
  }
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
