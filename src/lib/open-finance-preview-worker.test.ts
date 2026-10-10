import {afterEach,expect,it,vi} from "vitest";
const worker=vi.hoisted(()=>({handlers:new Map<string,(code?:number)=>void>(),fetch:vi.fn(),delay:vi.fn(),kill:vi.fn()}));
vi.mock("node:child_process",()=>({spawn:()=>({on:(event:string,callback:(code?:number)=>void)=>worker.handlers.set(event,callback),kill:worker.kill})}));
vi.mock("node:timers/promises",()=>({setTimeout:worker.delay}));
const signals=["SIGTERM","SIGINT"] as const;
const originalListeners=signals.map(signal=>process.listeners(signal));
const originalExitCode=process.exitCode;
afterEach(()=>{
  signals.forEach((signal,i)=>process.listeners(signal).forEach(listener=>{if(!originalListeners[i].includes(listener))process.removeListener(signal,listener);}));
  process.exitCode=originalExitCode;vi.unstubAllEnvs();vi.unstubAllGlobals();
});
it("keeps PF and PJ alternating after a timeout and an HTTP error, without parallel requests",async()=>{
  vi.stubEnv("OPEN_FINANCE_PREVIEW_ONLY","true");vi.stubEnv("OPEN_FINANCE_PREVIEW_BUSINESS_ENABLED","true");vi.stubEnv("OPEN_FINANCE_SYNC_ENABLED","true");
  vi.stubEnv("JWT_SECRET","j".repeat(32));vi.stubEnv("OPEN_FINANCE_SYNC_CRON_SECRET","c".repeat(32));
  worker.fetch.mockImplementation(async()=>{
    if(worker.fetch.mock.calls.length===1)throw new Error("timeout");
    return {ok:worker.fetch.mock.calls.length!==2,body:{cancel:async()=>{}}};
  });
  worker.delay.mockImplementation(async()=>{if(worker.fetch.mock.calls.length===3)worker.handlers.get("exit")?.(0);});
  vi.stubGlobal("fetch",worker.fetch);
  await import("../../scripts/start-open-finance-preview.mjs");
  expect(worker.fetch.mock.calls.map(([url])=>new URL(url).searchParams.get("mode"))).toEqual(["personal","business","personal"]);
  expect(worker.delay.mock.calls.map(([duration])=>duration)).toEqual([10000,30000,1100]);
});
