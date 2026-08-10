import { randomUUID } from "crypto";
import { getSupabase } from "./supabase";

/** Mutex do cron via tabela — update condicional numa linha só, atômico
 *  por natureza (o WHERE só bate pra uma requisição por vez mesmo com duas
 *  simultâneas). Preferido a pg_advisory_lock porque o Supabase acessa via
 *  REST sem conexão persistente por chamada, e advisory lock é escopado à
 *  sessão — o "unlock" podia cair numa conexão física diferente da que
 *  fez o "lock" e travar pra sempre. Resolve de verdade o caso de múltiplas
 *  instâncias reais (não só restart sequencial, como o lockfile local
 *  resolvia antes). */

// Generoso o bastante pra cobrir o pior caso realista de um tick (ex:
// analisar fatura em PDF demora dezenas de segundos) sem liberar a trava
// enquanto o dono original ainda está trabalhando de verdade.
const STALE_MS = 5 * 60_000;

/** Retorna um token de posse (ou null se não conseguiu a trava). Só quem
 *  tem o token consegue liberar — sem isso, uma execução antiga que ficou
 *  "presa" além do STALE_MS podia, ao finalmente terminar, liberar a trava
 *  que já tinha sido retomada por outra instância (deixando DUAS
 *  execuções achando que são donas ao mesmo tempo). */
export async function acquireCronLock(): Promise<string | null> {
  const token = randomUUID();
  const staleThreshold = new Date(Date.now() - STALE_MS).toISOString();
  const { data, error } = await getSupabase()
    .from("cron_lock")
    .update({ locked_at: new Date().toISOString(), owner: token })
    .eq("id", 1)
    .or(`locked_at.is.null,locked_at.lt.${staleThreshold}`)
    .select("id");
  if (error) { console.error("[cron-lock] acquire erro:", error.message); return null; }
  return data && data.length > 0 ? token : null;
}

export async function releaseCronLock(token: string): Promise<void> {
  await getSupabase().from("cron_lock").update({ locked_at: null, owner: null }).eq("id", 1).eq("owner", token);
}
