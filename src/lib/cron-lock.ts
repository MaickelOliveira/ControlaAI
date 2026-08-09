import { getSupabase } from "./supabase";

/** Mutex do cron via tabela — update condicional numa linha só, atômico
 *  por natureza (o WHERE só bate pra uma requisição por vez mesmo com duas
 *  simultâneas). Preferido a pg_advisory_lock porque o Supabase acessa via
 *  REST sem conexão persistente por chamada, e advisory lock é escopado à
 *  sessão — o "unlock" podia cair numa conexão física diferente da que
 *  fez o "lock" e travar pra sempre. Resolve de verdade o caso de múltiplas
 *  instâncias reais (não só restart sequencial, como o lockfile local
 *  resolvia antes). */
const STALE_MS = 2 * 60_000;

export async function acquireCronLock(): Promise<boolean> {
  const staleThreshold = new Date(Date.now() - STALE_MS).toISOString();
  const { data, error } = await getSupabase()
    .from("cron_lock")
    .update({ locked_at: new Date().toISOString() })
    .eq("id", 1)
    .or(`locked_at.is.null,locked_at.lt.${staleThreshold}`)
    .select("id");
  if (error) { console.error("[cron-lock] acquire erro:", error.message); return false; }
  return !!data && data.length > 0;
}

export async function releaseCronLock(): Promise<void> {
  await getSupabase().from("cron_lock").update({ locked_at: null }).eq("id", 1);
}
