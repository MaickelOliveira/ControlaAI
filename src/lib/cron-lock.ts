import { openSync, closeSync, unlinkSync, statSync } from "fs";
import path from "path";

/** Mutex simples baseado em arquivo — sem isso, se o deploy rodar mais de
 *  uma instância do processo (ou o endpoint externo /api/cron/reminders
 *  disparar no mesmo instante que o tick em-processo), as duas leem o
 *  mesmo lembrete como "devido", ambas mandam a mensagem, e o cliente
 *  recebe o mesmo lembrete duas vezes. `wx` é criação exclusiva atômica
 *  (falha se o arquivo já existe) — o mesmo truque que lockfiles usam há
 *  décadas. Trava mais velha que STALE_MS é considerada de um processo
 *  que morreu sem liberar, e é destravada sozinha. */
const LOCK_FILE = path.join(process.cwd(), "data", ".cron.lock");
const STALE_MS = 2 * 60_000;

export function acquireCronLock(): boolean {
  try {
    closeSync(openSync(LOCK_FILE, "wx"));
    return true;
  } catch {
    try {
      const age = Date.now() - statSync(LOCK_FILE).mtimeMs;
      if (age < STALE_MS) return false;
      unlinkSync(LOCK_FILE);
      closeSync(openSync(LOCK_FILE, "wx"));
      return true;
    } catch {
      return false;
    }
  }
}

export function releaseCronLock(): void {
  try { unlinkSync(LOCK_FILE); } catch { /* já liberada ou nunca existiu */ }
}
