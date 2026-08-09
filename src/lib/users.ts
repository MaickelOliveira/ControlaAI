import { readFileSync, existsSync } from "fs";
import { writeJSONAtomic } from "./json-store";
import path from "path";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";

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

const FILE = path.join(process.cwd(), "data", "users.json");

function load(): User[] {
  try {
    if (!existsSync(FILE)) return [];
    return JSON.parse(readFileSync(FILE, "utf-8"));
  } catch { return []; }
}

function save(users: User[]) {
  writeJSONAtomic(FILE, users);
}

export function getUsers(): User[] { return load(); }

export function getUserById(id: string): User | null {
  return load().find(u => u.id === id) ?? null;
}

export function getUserByEmail(email: string): User | null {
  return load().find(u => u.email.toLowerCase() === email.toLowerCase()) ?? null;
}

export function getUserByPhone(phone: string): User | null {
  const cleaned = phone.replace(/\D/g, "");
  return load().find(u => u.phone.replace(/\D/g, "") === cleaned) ?? null;
}

export async function createUser(data: {
  name: string;
  email: string;
  password: string;
  phone: string;
  plan: UserPlan;
  company?: string;
}): Promise<User> {
  const users = load();
  const trialEnd = new Date();
  trialEnd.setDate(trialEnd.getDate() + 14);

  const user: User = {
    id: randomUUID(),
    phone: data.phone.replace(/\D/g, ""),
    name: data.name,
    email: data.email.toLowerCase(),
    passwordHash: await bcrypt.hash(data.password, 10),
    plan: data.plan,
    status: "trial",
    activeMode: data.plan === "business" ? "business" : "personal",
    company: data.company,
    trialEndsAt: trialEnd.toISOString(),
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  save(users);
  return user;
}

export async function validatePassword(email: string, password: string): Promise<User | null> {
  const user = getUserByEmail(email);
  if (!user) return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  return ok ? user : null;
}

export function updateUser(id: string, patch: Partial<Omit<User, "id" | "createdAt">>): User | null {
  const users = load();
  const idx = users.findIndex(u => u.id === id);
  if (idx < 0) return null;
  users[idx] = { ...users[idx], ...patch };
  save(users);
  return users[idx];
}

/** activatedAt só é setado na PRIMEIRA vez que o cliente vira "active" —
 *  mesma regra já usada em admin/clientes/[id], reaproveitada aqui pro
 *  webhook de plataforma de venda (Hotmart/Kiwify/etc.) usar a mesma
 *  lógica em vez de duplicar. */
export function activateUser(id: string): User | null {
  const user = getUserById(id);
  if (!user) return null;
  return updateUser(id, { status: "active", ...(user.activatedAt ? {} : { activatedAt: new Date().toISOString() }) });
}

export function deactivateUser(id: string): User | null {
  return updateUser(id, { status: "inactive", deactivatedAt: new Date().toISOString() });
}

export function deleteUser(id: string): void {
  save(load().filter(u => u.id !== id));
}

export function createUserByPhone(phone: string, name: string, plan: UserPlan = "personal"): User {
  const users = load();
  const trialEnd = new Date();
  trialEnd.setDate(trialEnd.getDate() + 14);
  const cleanPhone = phone.replace(/\D/g, "");

  const user: User = {
    id: randomUUID(),
    phone: cleanPhone,
    name,
    email: `${cleanPhone}@whatsapp.controlaai.app`,
    passwordHash: "",
    plan,
    status: "trial",
    activeMode: plan === "business" ? "business" : "personal",
    trialEndsAt: trialEnd.toISOString(),
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  save(users);
  return user;
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

export function addWppPhone(userId: string, phone: string): User | null {
  const users = load();
  const idx = users.findIndex(u => u.id === userId);
  if (idx < 0) return null;
  const current = getWppPhones(users[idx]);
  if (!current.includes(phone)) current.push(phone);
  users[idx] = { ...users[idx], wppPhones: current, wppPhone: undefined };
  save(users);
  return users[idx];
}

export function removeWppPhone(userId: string, phone: string): User | null {
  const users = load();
  const idx = users.findIndex(u => u.id === userId);
  if (idx < 0) return null;
  const current = getWppPhones(users[idx]).filter(p => p !== phone);
  const names = { ...(users[idx].wppPhoneNames ?? {}) };
  delete names[phone];
  users[idx] = { ...users[idx], wppPhones: current, wppPhone: undefined, wppPhoneNames: names };
  save(users);
  return users[idx];
}

/** Define o nome de quem usa um número vinculado (ex: "Ana", "Gabriel") */
export function setWppPhoneName(userId: string, phone: string, name: string): User | null {
  const users = load();
  const idx = users.findIndex(u => u.id === userId);
  if (idx < 0) return null;
  const names = { ...(users[idx].wppPhoneNames ?? {}), [phone]: name.trim() };
  users[idx] = { ...users[idx], wppPhoneNames: names };
  save(users);
  return users[idx];
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
export function setWppPhoneRelation(userId: string, phone: string, relation: string): User | null {
  const users = load();
  const idx = users.findIndex(u => u.id === userId);
  if (idx < 0) return null;
  const relations = { ...(users[idx].wppPhoneRelations ?? {}), [phone]: relation.trim() };
  users[idx] = { ...users[idx], wppPhoneRelations: relations };
  save(users);
  return users[idx];
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
export function setWppPhoneAccess(userId: string, phone: string, access: "personal" | "business" | "both"): User | null {
  const users = load();
  const idx = users.findIndex(u => u.id === userId);
  if (idx < 0) return null;
  const accessMap = { ...(users[idx].wppPhoneAccess ?? {}), [phone]: access };
  users[idx] = { ...users[idx], wppPhoneAccess: accessMap };
  save(users);
  return users[idx];
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

export function generateWppVerifyCode(userId: string): string {
  const code = String(Math.floor(1000 + Math.random() * 9000)); // 4 dígitos
  const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min
  updateUser(userId, { wppVerifyCode: code, wppVerifyExpires: expires });
  return code;
}

export function getUserByWppCode(code: string): User | null {
  const users = load();
  const now = new Date();
  return users.find(u =>
    u.wppVerifyCode === code &&
    u.wppVerifyExpires &&
    new Date(u.wppVerifyExpires) > now
  ) ?? null;
}

export function isTrialExpired(user: User): boolean {
  if (user.status === "active") return false;
  return new Date() > new Date(user.trialEndsAt);
}
