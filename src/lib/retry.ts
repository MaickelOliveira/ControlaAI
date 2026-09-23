/** Repete uma chamada assíncrona quando o erro parece ser uma falha
 *  passageira de rede/infra (timeout, gateway, conexão) — visto acontecer
 *  de vez em quando entre o app e o Supabase. Erros "de verdade" (ex:
 *  violação de constraint do banco) não batem nesse padrão e não são
 *  repetidos, porque repetir só atrasaria a mesma falha.
 *
 *  Uso: envolver só operações que fazem sentido tentar de novo (uma
 *  gravação que ainda não confirmou pro usuário) — nunca envolver algo que
 *  já foi confirmado como concluído, pra não arriscar duplicar. */
const TRANSIENT_ERROR_PATTERN = /timeout|gateway|fetch failed|network|econnreset|socket hang up|\b50[234]\b/i;

function defaultIsTransient(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return TRANSIENT_ERROR_PATTERN.test(message);
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { attempts?: number; delaysMs?: number[]; isTransient?: (err: unknown) => boolean } = {}
): Promise<T> {
  const attempts = opts.attempts ?? 3;
  const delays = opts.delaysMs ?? [300, 800];
  const isTransient = opts.isTransient ?? defaultIsTransient;

  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const isLastAttempt = i === attempts - 1;
      if (isLastAttempt || !isTransient(err)) throw err;
      await new Promise((resolve) => setTimeout(resolve, delays[i] ?? delays[delays.length - 1]));
    }
  }
  throw lastError;
}
