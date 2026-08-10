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
  await db.from("password_reset_codes").update({ used_at: new Date().toISOString() }).eq("user_id", userId).is("used_at", null);
  const { error } = await db.from("password_reset_codes").insert({
    id, user_id: userId, code_hash: codeHash(id, code),
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
  });
  if (error) throw new Error(`[password-reset] ${error.message}`);
  return { id, code };
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
