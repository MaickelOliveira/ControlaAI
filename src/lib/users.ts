import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { getSupabase } from "./supabase";

export type UserPlan = "personal" | "business";
export type UserStatus = "trial" | "active" | "inactive";
export type UserMode = "personal" | "business";

export type User = {
  id: string;
  phone: string;
  name: string;
  email: string;
  passwordHash: string;
  plan: UserPlan;
  status: UserStatus;
  activeMode: UserMode;
  company?: string;
  wppPhone?: string;         // legado — migrado para wppPhones automaticamente
  wppPhones?: string[];      // lista de números vinculados
  wppPhoneNames?: Record<string, string>; // nome de quem usa cada número vinculado (para identificar quem registrou cada gasto)
  wppPhoneRelations?: Record<string, string>; // vínculo com a conta (ex: "Esposa", "Sócio") — usado em perguntas como "quanto minha esposa gastou"
  wppPhoneAccess?: Record<string, "personal" | "business" | "both">; // modo que a pessoa pode acessar por esse número; ausente = "both" (retrocompatível)
  maxWppPhones?: number;     // limite de números permitidos (default 1)
  wppVerifyCode?: string;    // código temporário de vinculação
  wppVerifyExpires?: string; // expiração do código
  customCategoriesExpense?: string[];
  customCategoriesIncome?: string[];
  priceOverride?: number;    // R$/mês negociado pra esse cliente; ausente = usa o preço padrão do plano (billing.ts)
  activatedAt?: string;      // ISO — quando o status virou "active" pela primeira vez
  deactivatedAt?: string;    // ISO — quando o status virou "inactive" pela última vez
  trialEndsAt: string;
  createdAt: string;
};

// Linha crua da tabela users (snake_case) <-> User (camelCase da aplicação,
// mesmo shape que já era usado com o JSON, pra não precisar mudar nenhum
// call-site além de tornar as chamadas assíncronas).
type Row = {
  id: string; phone: string; name: string; email: string; password_hash: string;
  plan: UserPlan; status: UserStatus; active_mode: UserMode; company: string | null;
  wpp_phone: string | null; wpp_phones: string[]; wpp_phone_names: Record<string, string>;
  wpp_phone_relations: Record<string, string>; wpp_phone_access: Record<string, "personal" | "business" | "both">;
  max_wpp_phones: number | null; wpp_verify_code: string | null; wpp_verify_expires: string | null;
  custom_categories_expense: string[]; custom_categories_income: string[];
  price_override: number | null; activated_at: string | null; deactivated_at: string | null;
  trial_ends_at: string; created_at: string;
};

function fromRow(r: Row): User {
  return {
    id: r.id, phone: r.phone, name: r.name, email: r.email, passwordHash: r.password_hash,
    plan: r.plan, status: r.status, activeMode: r.active_mode, company: r.company ?? undefined,
    wppPhone: r.wpp_phone ?? undefined, wppPhones: r.wpp_phones, wppPhoneNames: r.wpp_phone_names,
    wppPhoneRelations: r.wpp_phone_relations, wppPhoneAccess: r.wpp_phone_access,
    maxWppPhones: r.max_wpp_phones ?? undefined, wppVerifyCode: r.wpp_verify_code ?? undefined,
    wppVerifyExpires: r.wpp_verify_expires ?? undefined, customCategoriesExpense: r.custom_categories_expense,
    customCategoriesIncome: r.custom_categories_income, priceOverride: r.price_override ?? undefined,
    activatedAt: r.activated_at ?? undefined, deactivatedAt: r.deactivated_at ?? undefined,
    trialEndsAt: r.trial_ends_at, createdAt: r.created_at,
  };
}

// Converte um patch em camelCase (o shape que os call-sites já usam) pro
// formato snake_case das colunas — só inclui campos presentes no patch.
function toRowPatch(patch: Partial<Omit<User, "id" | "createdAt">>): Record<string, unknown> {
  const map: Record<string, string> = {
    phone: "phone", name: "name", email: "email", passwordHash: "password_hash",
    plan: "plan", status: "status", activeMode: "active_mode", company: "company",
    wppPhone: "wpp_phone", wppPhones: "wpp_phones", wppPhoneNames: "wpp_phone_names",
    wppPhoneRelations: "wpp_phone_relations", wppPhoneAccess: "wpp_phone_access",
    maxWppPhones: "max_wpp_phones", wppVerifyCode: "wpp_verify_code", wppVerifyExpires: "wpp_verify_expires",
    customCategoriesExpense: "custom_categories_expense", customCategoriesIncome: "custom_categories_income",
    priceOverride: "price_override", activatedAt: "activated_at", deactivatedAt: "deactivated_at",
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
  company?: string;
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
    status: "trial",
    active_mode: data.plan === "business" ? "business" : "personal",
    company: data.company,
    trial_ends_at: trialEnd.toISOString(),
  };
  const { data: inserted, error } = await getSupabase().from("users").insert(row).select("*").single();
  if (error) throw new Error(`[users] createUser falhou: ${error.message}`);
  return fromRow(inserted as Row);
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
    status: "trial",
    active_mode: plan === "business" ? "business" : "personal",
    trial_ends_at: trialEnd.toISOString(),
  };
  const { data: inserted, error } = await getSupabase().from("users").insert(row).select("*").single();
  if (error) throw new Error(`[users] createUserByPhone falhou: ${error.message}`);
  return fromRow(inserted as Row);
}

/** Retorna os números vinculados, migrando do campo legado wppPhone se necessário */
export function getWppPhones(user: User): string[] {
  if (user.wppPhones && user.wppPhones.length > 0) return user.wppPhones;
  if (user.wppPhone) return [user.wppPhone];
  return [];
}

export function getMaxWppPhones(user: User): number {
  return user.maxWppPhones ?? 1;
}

export async function addWppPhone(userId: string, phone: string): Promise<User | null> {
  const user = await getUserById(userId);
  if (!user) return null;
  const current = getWppPhones(user);
  if (!current.includes(phone)) current.push(phone);
  return updateUser(userId, { wppPhones: current, wppPhone: undefined });
}

export async function removeWppPhone(userId: string, phone: string): Promise<User | null> {
  const user = await getUserById(userId);
  if (!user) return null;
  const current = getWppPhones(user).filter(p => p !== phone);
  const names = { ...(user.wppPhoneNames ?? {}) };
  delete names[phone];
  return updateUser(userId, { wppPhones: current, wppPhone: undefined, wppPhoneNames: names });
}

/** Define o nome de quem usa um número vinculado (ex: "Ana", "Gabriel") */
export async function setWppPhoneName(userId: string, phone: string, name: string): Promise<User | null> {
  const user = await getUserById(userId);
  if (!user) return null;
  const names = { ...(user.wppPhoneNames ?? {}), [phone]: name.trim() };
  return updateUser(userId, { wppPhoneNames: names });
}

/** Retorna o nome cadastrado para o número, se houver */
export function getWppPhoneName(user: User, phone: string): string | undefined {
  return user.wppPhoneNames?.[phone];
}

/** Acha o número vinculado cujo nome cadastrado combina com o nome informado
 *  (ex: "Ana" -> o número cujo wppPhoneNames[phone] === "Ana") */
export function getWppPhoneByName(user: User, name: string): string | undefined {
  const target = normalizeName(name);
  const entries = Object.entries(user.wppPhoneNames ?? {});
  const match = entries.find(([, n]) => normalizeName(n) === target);
  return match?.[0];
}

/** Define o vínculo de quem usa um número vinculado (ex: "Esposa", "Sócio") */
export async function setWppPhoneRelation(userId: string, phone: string, relation: string): Promise<User | null> {
  const user = await getUserById(userId);
  if (!user) return null;
  const relations = { ...(user.wppPhoneRelations ?? {}), [phone]: relation.trim() };
  return updateUser(userId, { wppPhoneRelations: relations });
}

/** Acha o número vinculado cujo vínculo cadastrado combina com o termo
 *  informado (ex: "esposa" -> o número cujo wppPhoneRelations[phone] === "Esposa") —
 *  usado quando a pergunta cita um vínculo familiar/social em vez de um nome
 *  próprio (ex: "quanto minha esposa gastou"). */
export function getWppPhoneByRelation(user: User, relation: string): string | undefined {
  const target = normalizeName(relation);
  const entries = Object.entries(user.wppPhoneRelations ?? {});
  const match = entries.find(([, r]) => normalizeName(r) === target);
  return match?.[0];
}

/** Define o modo que a pessoa desse número pode acessar */
export async function setWppPhoneAccess(userId: string, phone: string, access: "personal" | "business" | "both"): Promise<User | null> {
  const user = await getUserById(userId);
  if (!user) return null;
  const accessMap = { ...(user.wppPhoneAccess ?? {}), [phone]: access };
  return updateUser(userId, { wppPhoneAccess: accessMap });
}

/** Modo que a pessoa desse número pode acessar — "both" se nunca foi definido
 *  (retrocompatível: números vinculados antes dessa feature não ficam travados). */
export function getWppPhoneAccess(user: User, phone: string): "personal" | "business" | "both" {
  return user.wppPhoneAccess?.[phone] ?? "both";
}

const DIACRITICS_REGEX = /[̀-ͯ]/g;

function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(DIACRITICS_REGEX, "")
    .trim()
    .toLowerCase();
}

export async function generateWppVerifyCode(userId: string): Promise<string> {
  const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min
  // Sorteia até achar um código sem dono com vinculação ainda válida — sem
  // isso, dois clientes pedindo código na mesma janela de 10min podiam
  // colidir e travar a busca por código (mais de uma linha bate).
  for (let attempt = 0; attempt < 20; attempt++) {
    const code = String(Math.floor(1000 + Math.random() * 9000)); // 4 dígitos
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
  return user.status !== "inactive" && !isTrialExpired(user);
}
