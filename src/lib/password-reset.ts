import { createHmac, randomInt, randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { getSupabase } from "./supabase";
import { updateUser } from "./users";

function secret(): string {
  const value = process.env.PASSWORD_RESET_SECRET || process.env.JWT_SECRET;
  if (!value) throw new Error("PASSWORD_RESET_SECRET ou JWT_SECRET não configurado");
  return value;
}

export function isValidResetCode(value: unknown): value is string {
  return typeof value === "string" && /^\d{6}$/.test(value);
}

export function isValidNewPassword(value: unknown): value is string {
  return typeof value === "string" && value.length >= 10 && value.length <= 128;
}

function codeHash(id: string, code: string): string {
  return createHmac("sha256", secret()).update(`${id}:${code}`).digest("hex");
}

export async function createPasswordResetCode(userId: string): Promise<{ id: string; code: string }> {
  const db = getSupabase();
  const id = randomUUID();
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.from("password_reset_codes").update({ used_at: new Date().toISOString() }).eq("user_id", userId).eq("purpose", "reset").is("used_at", null);
  const { error } = await db.from("password_reset_codes").insert({
    id, user_id: userId, code_hash: codeHash(id, code),
    purpose: "reset",
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
  });
  if (error) throw new Error(`[password-reset] ${error.message}`);
  return { id, code };
}

export async function createPasswordSetupLink(userId: string): Promise<{ id: string }> {
  const db = getSupabase();
  const id = randomUUID();
  const nonce = randomUUID();
  await db.from("password_reset_codes").update({ used_at: new Date().toISOString() }).eq("user_id", userId).eq("purpose", "setup").is("used_at", null);
  const { error } = await db.from("password_reset_codes").insert({
    id, user_id: userId, code_hash: codeHash(id, nonce), purpose: "setup",
    expires_at: "9999-12-31T23:59:59.999Z",
  });
  if (error) throw new Error(`[password-setup] ${error.message}`);
  return { id };
}

export async function getPasswordSetupUserId(id: string): Promise<string | null> {
  const { data, error } = await getSupabase().from("password_reset_codes").select("user_id").eq("id", id).eq("purpose", "setup").is("used_at", null).maybeSingle();
  return error || !data || typeof data.user_id !== "string" ? null : data.user_id;
}

export async function completePasswordSetup(setupId: string, resetId: string, code: string, password: string): Promise<boolean> {
  if (!isValidResetCode(code) || !isValidNewPassword(password)) return false;
  const setupUserId = await getPasswordSetupUserId(setupId);
  if (!setupUserId) return false;
  const { data: resetUserId, error } = await getSupabase().rpc("consume_password_reset_code", {
    p_id: resetId, p_code_hash: codeHash(resetId, code),
  });
  if (error || resetUserId !== setupUserId) return false;
  const passwordHash = await bcrypt.hash(password, 10);
  const updated = await updateUser(setupUserId, { passwordHash, passwordChangedAt: new Date().toISOString() });
  if (!updated) return false;
  await getSupabase().from("password_reset_codes").update({ used_at: new Date().toISOString() }).eq("id", setupId).eq("purpose", "setup").is("used_at", null);
  return true;
}

export async function invalidatePasswordResetCode(id: string): Promise<void> {
  await getSupabase().from("password_reset_codes").update({ used_at: new Date().toISOString() }).eq("id", id);
}

export async function resetPasswordWithCode(id: string, code: string, password: string): Promise<boolean> {
  if (!isValidResetCode(code) || !isValidNewPassword(password)) return false;
  const { data: userId, error } = await getSupabase().rpc("consume_password_reset_code", {
    p_id: id, p_code_hash: codeHash(id, code),
  });
  if (error || typeof userId !== "string") return false;
  const passwordHash = await bcrypt.hash(password, 10);
  return (await updateUser(userId, { passwordHash, passwordChangedAt: new Date().toISOString() })) !== null;
}
