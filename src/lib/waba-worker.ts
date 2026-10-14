import "server-only";
import {runWithTrustedCompanyJob} from "./company-context";
import {claimWabaMessage, cleanupWabaInbox, wabaInboxAttentionCount} from "./waba-inbox";
import {processWabaMessage} from "./waba-process";

const KEY = Symbol.for("zelo.wabaInboxWorker");
type State = {started: boolean; running: boolean; timer: ReturnType<typeof setTimeout> | null; wakeNext: boolean; lastCleanup: number};
const registry = process as typeof process & {[KEY]?: State};

export async function pumpWabaInbox(): Promise<number> {
  let processed = 0;
  for (; processed < 10; processed++) {
    const message = await claimWabaMessage();
    if (!message) break;
    await processWabaMessage(message);
  }
  return processed;
}

function schedule(state: State, delay: number): void {
  if (state.timer) clearTimeout(state.timer);
  state.timer = setTimeout(() => {
    state.timer = null;
    void tick(state);
  }, delay);
  state.timer.unref();
}

async function tick(state: State): Promise<void> {
  if (state.running) { state.wakeNext = true; return; }
  state.running = true;
  let processed = 0;
  try {
    processed = await runWithTrustedCompanyJob(pumpWabaInbox);
    if (Date.now() - state.lastCleanup >= 3_600_000) {
      await runWithTrustedCompanyJob(cleanupWabaInbox);
      state.lastCleanup = Date.now();
    }
    const attention = await runWithTrustedCompanyJob(wabaInboxAttentionCount);
    if (attention) console.error("[waba-inbox] Mensagens precisam de conferência");
  } catch { console.error("[waba-inbox] Recuperação adiada"); }
  finally {
    state.running = false;
    if (state.wakeNext) { state.wakeNext = false; schedule(state, 0); }
    else schedule(state, processed ? 5000 : 60000);
  }
}

export function startWabaInboxWorker(): void {
  const state = registry[KEY] ?? (registry[KEY] = {started: false, running: false, timer: null, wakeNext: false, lastCleanup: 0});
  if (state.started) return;
  state.started = true;
  schedule(state, 15000);
}

export function wakeWabaInboxWorker(): void {
  const state = registry[KEY];
  if (!state?.started) return;
  if (state.running) state.wakeNext = true;
  else schedule(state, 0);
}
