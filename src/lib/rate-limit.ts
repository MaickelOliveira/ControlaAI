import { getSupabase } from "./supabase";
import { createHash } from "crypto";

/** O banco só recebe o hash da chave, evitando persistir e-mails/IPs em texto
 *  claro na tabela operacional de rate limit. */
function hashKey(key: string): string {
  return `sha256:${createHash("sha256").update(key).digest("hex")}`;
}

/** Incremento e decisão acontecem atomicamente no Postgres. Em caso de erro,
 *  falha fechado: autenticação/ações sensíveis não ficam sem proteção porque
 *  o limitador está indisponível. */
export async function checkRateLimit(key: string, max: number, windowMs: number): Promise<boolean> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("check_rate_limit", {
    p_key: hashKey(key),
    p_max: max,
    p_window_ms: windowMs,
  });
  if (error) {
    console.error("Rate limit indisponível:", error.message);
    return false;
  }
  return data === true;
}
