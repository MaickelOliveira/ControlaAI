import { getSupabase } from "./supabase";

/** Limitador de tentativas por janela de tempo (login, cadastro, código de
 *  vinculação de WhatsApp) — sem isso, nada impede força bruta contra uma
 *  conta específica ou criação abusiva de contas trial. Read-then-write
 *  (não uma única UPDATE atômica): sob concorrência muito alta na MESMA
 *  chave, duas requisições podem ler a mesma contagem e ambas passarem —
 *  aceitável aqui porque o objetivo é dificultar automação, não ser um
 *  torniquete perfeito (mesmo trade-off já usado em markReminderFailed). */
export async function checkRateLimit(key: string, max: number, windowMs: number): Promise<boolean> {
  const supabase = getSupabase();
  const now = Date.now();
  const { data } = await supabase.from("rate_limits").select("count, window_start").eq("key", key).maybeSingle();
  const row = data as { count: number; window_start: string } | null;

  if (!row || now - new Date(row.window_start).getTime() > windowMs) {
    await supabase.from("rate_limits").upsert({ key, count: 1, window_start: new Date(now).toISOString() });
    return true;
  }

  if (row.count >= max) return false;

  await supabase.from("rate_limits").update({ count: row.count + 1 }).eq("key", key);
  return true;
}
