type BankUpdates<T> = {
  load: (signal: AbortSignal) => Promise<T | null>;
  onData: (data: T | null) => void;
  onError: (error: unknown) => void;
  isVisible: () => boolean;
  subscribeWake: (wake: () => void) => () => void;
};

/** Poll the Zelo read endpoint, never the bank/provider. One request per visible page. */
export function startBankUpdates<T>(options: BankUpdates<T>): () => void {
  let stopped=false, unavailable=false, running=false, failures=0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const controller=new AbortController();
  async function update() {
    if(stopped || unavailable || running || !options.isVisible())return;
    clearTimeout(timer);running=true;
    try {
      const data=await options.load(controller.signal);
      if(stopped)return;
      unavailable=data===null;failures=0;options.onData(data);
    } catch(error) {
      if(!stopped){failures++;options.onError(error);}
    } finally {
      running=false;
      if(!stopped && !unavailable && options.isVisible())timer=setTimeout(()=>void update(),Math.min(60000,10000*2**Math.min(failures,3)));
    }
  }
  const unsubscribe=options.subscribeWake(()=>void update());
  void update();
  return ()=>{stopped=true;clearTimeout(timer);controller.abort();unsubscribe();};
}
