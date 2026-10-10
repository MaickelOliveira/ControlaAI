import {it,expect,vi,afterEach} from "vitest";
import {register} from "./instrumentation";
afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();vi.useRealTimers();});
it("never schedules legacy production tasks when starting the isolated preview",async()=>{
  vi.stubEnv("OPEN_FINANCE_PREVIEW_ONLY","true");vi.stubEnv("NEXT_RUNTIME","nodejs");
  vi.useFakeTimers();
  const interval=vi.spyOn(globalThis,"setInterval"),timeout=vi.spyOn(globalThis,"setTimeout");
  const listeners=vi.spyOn(process,"on");
  await register();
  expect(interval).not.toHaveBeenCalled();expect(timeout).not.toHaveBeenCalled();
  expect(listeners).not.toHaveBeenCalled();
});
