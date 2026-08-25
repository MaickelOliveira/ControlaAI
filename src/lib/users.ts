import { randomUUID, randomInt } from "crypto";
import bcrypt from "bcryptjs";
import { getSupabase } from "./supabase";

export type UserPlan = "personal" | "business";
export type BillingCycle = "monthly" | "semiannual" | "annual";
export type UserStatus = "trial" | "active" | "inactive";
export type UserMode = "personal" | "business";
// "pt-BR" é o default de toda conta existente — nunca mudar sem ação
// explícita do usuário (troca manual ou compra num checkout de outro idioma).
export type UserLocale = "pt-BR" | "pt-PT" | "es";

export type User = {
  id: string;
  phone: string;
  name: string;
  email: string;
  passwordHash: string;
  plan: UserPlan;
  billingCycle: BillingCycle;
  status: UserStatus;
  activeMode: UserMode;
  locale: UserLocale;
  company?: string;
  // Telefones vinculados: ver wpp-phone-links.ts (tabela própria, com
  // UNIQUE(phone) — antes eram campos array/objeto aqui, sem garantia de
  // unicidade global entre contas).
  maxWppPhones?: number;     // limite de números permitidos (default 1)
  wppVerifyCode?: string;    // código temporário de vinculação
  wppVerifyExpires?: string; // expiração do código
  customCategoriesExpense?: string[];
  customCategoriesIncome?: string[];
  priceOverride?: number;    // R$/mês negociado pra esse cliente; ausente = usa o preço padrão do plano (billing.ts)
  activatedAt?: string;      // ISO — quando o status virou "active" pela primeira vez
  deactivatedAt?: string;    // ISO — quando o status virou "inactive" pela última vez
  passwordChangedAt?: string;// ISO — invalida sessões anteriores à troca de senha
  trialEndsAt: string;
  createdAt: string;
};

// Linha crua da tabela users (snake_case) <-> User (camelCase da aplicação,
// mesmo shape que já era usado com o JSON, pra não precisar mudar nenhum
// call-site além de tornar as chamadas assíncronas).
type Row = {
  id: string; phone: string; name: string; email: string; password_hash: string;
  plan: UserPlan; billing_cycle: BillingCycle | null; status: UserStatus; active_mode: UserMode; locale: string | null; company: string | null;
  max_wpp_phones: number | null; wpp_verify_code: string | null; wpp_verify_expires: string | null;
  custom_categories_expense: string[]; custom_categories_income: string[];
  price_override: number | null; activated_at: string | null; deactivated_at: string | null; password_changed_at: string | null;
  trial_ends_at: string; created_at: string;
};

function fromRow(r: Row): User {
  return {
    id: r.id, phone: r.phone, name: r.name, email: r.email, passwordHash: r.password_hash,
    plan: r.plan, billingCycle: r.billing_cycle ?? "monthly", status: r.status, activeMode: r.active_mode,
    locale: (r.locale as UserLocale) ?? "pt-BR", company: r.company ?? undefined,
    maxWppPhones: r.max_wpp_phones ?? undefined, wppVerifyCode: r.wpp_verify_code ?? undefined,
    wppVerifyExpires: r.wpp_verify_expires ?? undefined, customCategoriesExpense: r.custom_categories_expense,
    customCategoriesIncome: r.custom_categories_income, priceOverride: r.price_override ?? undefined,
    activatedAt: r.activated_at ?? undefined, deactivatedAt: r.deactivated_at ?? undefined, passwordChangedAt: r.password_changed_at ?? undefined,
    trialEndsAt: r.trial_ends_at, createdAt: r.created_at,
  };
}

// Converte um patch em camelCase (o shape que os call-sites já usam) pro
// formato snake_case das colunas — só inclui campos presentes no patch.
function toRowPatch(patch: Partial<Omit<User, "id" | "createdAt">>): Record<string, unknown> {
  const map: Record<string, string> = {
    phone: "phone", name: "name", email: "email", passwordHash: "password_hash",
    plan: "plan", billingCycle: "billing_cycle", status: "status", activeMode: "active_mode", locale: "locale", company: "company",
    maxWppPhones: "max_wpp_phones", wppVerifyCode: "wpp_verify_code", wppVerifyExpires: "wpp_verify_expires",
    customCategoriesExpense: "custom_categories_expense", customCategoriesIncome: "custom_categories_income",
    priceOverride: "price_override", activatedAt: "activated_at", deactivatedAt: "deactivated_at", passwordChangedAt: "password_changed_at",
    trialEndsAt: "trial_ends_at",
  };
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    const col = map[key];
    if (col) out[col] = value;
  }
  return out;
}

export async function getUsers(): Promise<User[]> {
  const { data, error } = await getSupabase().from("users").select("*");
  if (error) { console.error("[users] getUsers erro:", error.message); return []; }
  return (data as Row[]).map(fromRow);
}

export async function getUserById(id: string): Promise<User | null> {
  const { data, error } = await getSupabase().from("users").select("*").eq("id", id).maybeSingle();
  if (error || !data) return null;
  return fromRow(data as Row);
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const { data, error } = await getSupabase().from("users").select("*").ilike("email", email).maybeSingle();
  if (error || !data) return null;
  return fromRow(data as Row);
}

export async function getUserByPhone(phone: string): Promise<User | null> {
  const cleaned = phone.replace(/\D/g, "");
  const { data, error } = await getSupabase().from("users").select("*").eq("phone", cleaned).maybeSingle();
  if (error || !data) return null;
  return fromRow(data as Row);
}

export async function createUser(data: {
  name: string;
  email: string;
  password: string;
  phone: string;
  plan: UserPlan;
  billingCycle?: BillingCycle;
  company?: string;
  status?: UserStatus;
  locale?: UserLocale;
}): Promise<User> {
  const trialEnd = new Date();
  trialEnd.setDate(trialEnd.getDate() + 14);

  const row = {
    id: randomUUID(),
    phone: data.phone.replace(/\D/g, ""),
    name: data.name,
    email: data.email.toLowerCase(),
    password_hash: await bcrypt.hash(data.password, 10),
    plan: data.plan,
    billing_cycle: data.billingCycle ?? "monthly",
    status: data.status ?? "trial",
    active_mode: data.plan === "business" ? "business" : "personal",
    ...(data.locale ? { locale: data.locale } : {}),
    company: data.company,
    trial_ends_at: trialEnd.toISOString(),
  };
  const { data: inserted, error } = await getSupabase().from("users").insert(row).select("*").single();
  if (error) throw new Error(`[users] createUser falhou: ${error.message}`);
  return fromRow(inserted as Row);
}

export async function createPaidUser(data: { name: string; email: string; phone?: string; plan?: UserPlan; locale?: UserLocale }): Promise<User> {
  return createUser({
    name: data.name,
    email: data.email,
    phone: data.phone || "",
    password: randomUUID() + randomUUID(),
    plan: data.plan || "personal",
    status: "active",
    locale: data.locale,
  });
}

export async function validatePassword(email: string, password: string): Promise<User | null> {
  const user = await getUserByEmail(email);
  if (!user) return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  return ok ? user : null;
}

export async function updateUser(id: string, patch: Partial<Omit<User, "id" | "createdAt">>): Promise<User | null> {
  const { data, error } = await getSupabase().from("users").update(toRowPatch(patch)).eq("id", id).select("*").maybeSingle();
  if (error || !data) return null;
  return fromRow(data as Row);
}

/** activatedAt só é setado na PRIMEIRA vez que o cliente vira "active" —
 *  mesma regra já usada em admin/clientes/[id], reaproveitada aqui pro
 *  webhook de plataforma de venda (Hotmart/Kiwify/etc.) usar a mesma
 *  lógica em vez de duplicar. */
export async function activateUser(id: string): Promise<User | null> {
  const user = await getUserById(id);
  if (!user) return null;
  return updateUser(id, { status: "active", ...(user.activatedAt ? {} : { activatedAt: new Date().toISOString() }) });
}

export async function deactivateUser(id: string): Promise<User | null> {
  return updateUser(id, { status: "inactive", deactivatedAt: new Date().toISOString() });
}

export async function deleteUser(id: string): Promise<void> {
  await getSupabase().from("users").delete().eq("id", id);
}

export async function createUserByPhone(phone: string, name: string, plan: UserPlan = "personal"): Promise<User> {
  const trialEnd = new Date();
  trialEnd.setDate(trialEnd.getDate() + 14);
  const cleanPhone = phone.replace(/\D/g, "");

  const row = {
    id: randomUUID(),
    phone: cleanPhone,
    name,
    email: `${cleanPhone}@whatsapp.controlaai.app`,
    password_hash: "",
    plan,
    billing_cycle: "monthly",
    status: "trial",
    active_mode: plan === "business" ? "business" : "personal",
    trial_ends_at: trialEnd.toISOString(),
  };
  const { data: inserted, error } = await getSupabase().from("users").insert(row).select("*").single();
  if (error) throw new Error(`[users] createUserByPhone falhou: ${error.message}`);
  return fromRow(inserted as Row);
}

export const UNLIMITED_WPP_PHONES = 1_000_000;

export function getMaxWppPhones(_user: User): number {
  void _user;
  return UNLIMITED_WPP_PHONES;
}

export async function generateWppVerifyCode(userId: string): Promise<string> {
  const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min
  // Sorteia até achar um código sem dono com vinculação ainda válida — sem
  // isso, dois clientes pedindo código na mesma janela de 10min podiam
  // colidir e travar a busca por código (mais de uma linha bate).
  // crypto.randomInt (não Math.random) — o código de vinculação é
  // efetivamente uma senha temporária de posse da conta; Math.random não é
  // adequado pra nada com implicação de segurança.
  for (let attempt = 0; attempt < 20; attempt++) {
    const code = String(randomInt(1000, 10000)); // 4 dígitos
    const holder = await getUserByWppCode(code);
    if (holder && holder.id !== userId) continue;
    await updateUser(userId, { wppVerifyCode: code, wppVerifyExpires: expires });
    return code;
  }
  throw new Error("[users] não foi possível gerar um código de vinculação único");
}

export async function getUserByWppCode(code: string): Promise<User | null> {
  const { data, error } = await getSupabase().from("users").select("*").eq("wpp_verify_code", code);
  if (error || !data || data.length === 0) return null;
  const now = Date.now();
  const valid = (data as Row[]).find(row => row.wpp_verify_expires && new Date(row.wpp_verify_expires).getTime() > now);
  return valid ? fromRow(valid) : null;
}

export function isTrialExpired(user: User): boolean {
  if (user.status === "active") return false;
  return new Date() > new Date(user.trialEndsAt);
}

/** isTrialExpired sozinho NÃO bloqueia cliente "inactive" (desativado pelo
 *  admin) — só checa a data do trial, então um "inactive" cujo trialEndsAt
 *  ainda não passou continuava com acesso total ao bot. Esse é o gate
 *  único e correto: usa em getSession() (web) e no handler do WhatsApp
 *  (bot), pra não ter dois lugares checando isso de formas diferentes. */
export function hasAccess(user: User): boolean {
  return user.status === "active";
}
