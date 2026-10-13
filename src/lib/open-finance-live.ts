type BankUpdates<T> = {
  load: (signal: AbortSignal) => Promise<T | null>;
  onData: (data: T | null) => void;
  onError: (error: unknown) => void;
  isVisible: () => boolean;
  subscribeWake: (wake: () => void) => () => void;
  needsFastUpdates?: (data: T) => boolean;
};

/** Keep authorization and reported import activity fast; absent state is not activity. */
export function bankUpdatesPending(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const value = data as Record<string, unknown>;
  const bank = value.bank && typeof value.bank === "object" ? value.bank as Record<string, unknown> : null;
  const overview = bank?.overview && typeof bank.overview === "object" ? bank.overview as Record<string, unknown> : value;
  const report = bank?.report && typeof bank.report === "object" ? bank.report as Record<string, unknown> : null;
  const connections = Array.isArray(overview.connections) ? overview.connections : [];
  const sync = Array.isArray(overview.sync) ? overview.sync : [];
  // The report flag reads sync_jobs, whereas overview.sync may be an older
  // committed watermark. Conservatively keep flagged failures fast as well.
  return report?.sync_pending === true
    || connections.some(connection => connection && !connection.archived_at && (connection.status === "pending" || connection.status === "revoking"))
    || sync.some(job => job && (job.status === "pending" || job.status === "running"));
}

/** Poll the Zelo read endpoint, never the bank/provider. One request per visible page. */
export function startBankUpdates<T>(options: BankUpdates<T>): () => void {
  let stopped=false, unavailable=false, running=false, failures=0, idleDelay=10000;
  let previousJson: string | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const controller=new AbortController();
  async function update() {
    if(stopped || unavailable || running || !options.isVisible())return;
    clearTimeout(timer);running=true;
    try {
      const data=await options.load(controller.signal);
      if(stopped)return;
      unavailable=data===null;
      let json: string | undefined;
      let fast=true;
      if(data!==null) {
        // This snapshot stays in this mounted page only, never storage or telemetry.
        try { json=JSON.stringify(data);fast=options.needsFastUpdates?.(data)??false; } catch { /* Read normally if comparison is unavailable. */ }
      }
      idleDelay=!failures && !fast && json!==undefined && json===previousJson?Math.min(60000,idleDelay*2):10000;
      previousJson=json;
      failures=0;
      options.onData(data);
    } catch(error) {
      if(!stopped){failures++;options.onError(error);}
    } finally {
      running=false;
      if(!stopped && !unavailable && options.isVisible())timer=setTimeout(()=>void update(),failures?Math.min(60000,10000*2**Math.min(failures,3)):idleDelay);
    }
  }
  const unsubscribe=options.subscribeWake(()=>void update());
  void update();
  return ()=>{stopped=true;previousJson=undefined;clearTimeout(timer);controller.abort();unsubscribe();};
}
