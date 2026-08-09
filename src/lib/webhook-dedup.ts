import { readJSON, writeJSONAtomic } from "./json-store";
import path from "path";

/** Guarda de deduplicação de mensagens de webhook (WABA) persistida em
 *  disco — a versão anterior usava um Set em memória, que reseta a cada
 *  restart do processo. Esse ambiente reinicia a cada deploy, e o backoff
 *  de reentrega da Meta pode ficar ativo por mais de um dia: uma reentrega
 *  que chegasse depois de qualquer restart não era reconhecida como
 *  duplicata e reprocessava a mensagem do zero. */
const FILE = path.join(process.cwd(), "data", "webhook-message-ids.json");
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // folga confortável acima de qualquer janela de retentativa da Meta

type Store = Record<string, number>; // messageId -> timestamp de quando foi processado

export function alreadyProcessed(id: string | undefined): boolean {
  if (!id) return false;
  const store = readJSON<Store>(FILE, {});
  if (store[id]) return true;

  const now = Date.now();
  const pruned: Store = { [id]: now };
  for (const [key, ts] of Object.entries(store)) {
    if (now - ts < MAX_AGE_MS) pruned[key] = ts;
  }
  writeJSONAtomic(FILE, pruned);
  return false;
}
