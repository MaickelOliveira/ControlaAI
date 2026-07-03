import { readFileSync, writeFileSync, existsSync } from "fs";
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
  writeFileSync(FILE, JSON.stringify(users, null, 2));
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

export function isTrialExpired(user: User): boolean {
  if (user.status === "active") return false;
  return new Date() > new Date(user.trialEndsAt);
}
