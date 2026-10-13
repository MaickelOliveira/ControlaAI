import {afterEach,expect,it,vi} from "vitest";
import {startBankUpdates} from "./open-finance-live";
afterEach(()=>{
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("confirms a mobile authorization automatically from saved data without a return click",async()=>{
  vi.useFakeTimers();const load=vi.fn().mockResolvedValueOnce({status:"pending"}).mockResolvedValue({status:"active"}),received=vi.fn();
  const stop=startBankUpdates({load,onData:received,onError:vi.fn(),isVisible:()=>true,subscribeWake:()=>()=>{}});
  await vi.advanceTimersByTimeAsync(0);expect(received).toHaveBeenLastCalledWith({status:"pending"});
  await vi.advanceTimersByTimeAsync(10000);expect(received).toHaveBeenLastCalledWith({status:"active"});stop();
});
it("waits while hidden and checks immediately when the user returns",async()=>{
  vi.useFakeTimers();let visible=false,wake=()=>{};const load=vi.fn().mockResolvedValue({}),received=vi.fn();
  const stop=startBankUpdates({load,onData:received,onError:vi.fn(),isVisible:()=>visible,subscribeWake:f=>{wake=f;return()=>{};}});
  await vi.advanceTimersByTimeAsync(60000);expect(load).not.toHaveBeenCalled();visible=true;wake();await vi.advanceTimersByTimeAsync(0);expect(load).toHaveBeenCalledTimes(1);stop();
});
it("does not overlap requests and aborts on a mode/page change",async()=>{
  vi.useFakeTimers();let resolve:(v:object)=>void=()=>{},wake=()=>{},signal:AbortSignal|undefined;const received=vi.fn(),unsubscribe=vi.fn();
  const load=vi.fn((s:AbortSignal)=>{signal=s;return new Promise<object>(r=>{resolve=r;});});
  const stop=startBankUpdates({load,onData:received,onError:vi.fn(),isVisible:()=>true,subscribeWake:f=>{wake=f;return unsubscribe;}});
  wake();wake();await vi.advanceTimersByTimeAsync(60000);expect(load).toHaveBeenCalledTimes(1);stop();expect(signal?.aborted).toBe(true);resolve({});await vi.advanceTimersByTimeAsync(0);expect(received).not.toHaveBeenCalled();expect(unsubscribe).toHaveBeenCalledOnce();
});
it("stops when the feature is unavailable and backs off on failures",async()=>{
  vi.useFakeTimers();const load=vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(null),error=vi.fn();
  const stop=startBankUpdates({load,onData:vi.fn(),onError:error,isVisible:()=>true,subscribeWake:()=>()=>{}});
  await vi.advanceTimersByTimeAsync(0);expect(error).toHaveBeenCalledOnce();await vi.advanceTimersByTimeAsync(10000);expect(load).toHaveBeenCalledTimes(1);await vi.advanceTimersByTimeAsync(10000);expect(load).toHaveBeenCalledTimes(2);await vi.advanceTimersByTimeAsync(120000);expect(load).toHaveBeenCalledTimes(2);stop();
});

it("slows repeated equal JSON results to at most 60 seconds and keeps reading fresh data", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  const times: number[] = [];
  const bankData = {connections: [{status: "active"}], accounts: [{balance: 1250}]};
  const load = vi.fn(async () => {
    times.push(Date.now());
    return JSON.parse(JSON.stringify(bankData)) as typeof bankData;
  });
  const received = vi.fn();
  const stop = startBankUpdates({
    load, onData: received, onError: vi.fn(), isVisible: () => true,
    subscribeWake: () => () => {},
  });

  try {
    await vi.advanceTimersByTimeAsync(0);
    for (let update = 0; update < 12; update++) {
      await vi.advanceTimersToNextTimerAsync();
    }

    const delays = times.slice(1).map((time, index) => time - times[index]);
    expect(delays[0]).toBe(10000);
    expect(delays.every(delay => delay >= 10000 && delay <= 60000)).toBe(true);
    expect(delays.every((delay, index) => index === 0 || delay >= delays[index - 1])).toBe(true);
    expect(delays.at(-1)).toBe(60000);
    expect(load).toHaveBeenCalledTimes(13);
    expect(received).toHaveBeenCalledTimes(13);
    expect(received).toHaveBeenLastCalledWith(bankData);

    await vi.advanceTimersByTimeAsync(59999);
    expect(load).toHaveBeenCalledTimes(13);
    await vi.advanceTimersByTimeAsync(1);
    expect(load).toHaveBeenCalledTimes(14);
    expect(received).toHaveBeenCalledTimes(14);
  } finally {
    stop();
  }
});

it("does not overlap an idle read even when timers and wake events occur while it is pending", async () => {
  vi.useFakeTimers();
  let wake = () => {};
  let blockNextRead = false;
  let resolveRead: (data: {balance: number}) => void = () => {};
  const load = vi.fn(async () => {
    if (blockNextRead) {
      return new Promise<{balance: number}>(resolve => { resolveRead = resolve; });
    }
    return {balance: 1250};
  });
  const received = vi.fn();
  const stop = startBankUpdates({
    load, onData: received, onError: vi.fn(), isVisible: () => true,
    subscribeWake: listener => { wake = listener; return () => {}; },
  });

  try {
    await vi.advanceTimersByTimeAsync(0);
    for (let update = 0; update < 12; update++) {
      await vi.advanceTimersToNextTimerAsync();
    }
    blockNextRead = true;
    await vi.advanceTimersToNextTimerAsync();
    expect(load).toHaveBeenCalledTimes(14);
    expect(received).toHaveBeenCalledTimes(13);

    wake();
    wake();
    await vi.advanceTimersByTimeAsync(120000);
    expect(load).toHaveBeenCalledTimes(14);
    expect(received).toHaveBeenCalledTimes(13);

    blockNextRead = false;
    resolveRead({balance: 1250});
    await vi.advanceTimersByTimeAsync(0);
    expect(received).toHaveBeenCalledTimes(14);
    await vi.advanceTimersByTimeAsync(59999);
    expect(load).toHaveBeenCalledTimes(14);
    await vi.advanceTimersByTimeAsync(1);
    expect(load).toHaveBeenCalledTimes(15);
  } finally {
    stop();
  }
});

it("returns to 10 seconds when nested JSON changes even if the transport reuses the same object", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  const bankData = {accounts: [{balance: 1250}]};
  const times: number[] = [];
  const load = vi.fn(async () => {
    times.push(Date.now());
    return bankData;
  });
  const received = vi.fn();
  const stop = startBankUpdates({
    load, onData: received, onError: vi.fn(), isVisible: () => true,
    subscribeWake: () => () => {},
  });

  try {
    await vi.advanceTimersByTimeAsync(0);
    for (let update = 0; update < 12; update++) {
      await vi.advanceTimersToNextTimerAsync();
    }
    expect(times.at(-1)! - times.at(-2)!).toBe(60000);

    bankData.accounts[0].balance = 1400;
    await vi.advanceTimersToNextTimerAsync();
    expect(received).toHaveBeenLastCalledWith({accounts: [{balance: 1400}]});
    const readsAfterChange = load.mock.calls.length;
    await vi.advanceTimersByTimeAsync(9999);
    expect(load).toHaveBeenCalledTimes(readsAfterChange);
    await vi.advanceTimersByTimeAsync(1);
    expect(load).toHaveBeenCalledTimes(readsAfterChange + 1);
    expect(times.at(-1)! - times.at(-2)!).toBe(10000);
  } finally {
    stop();
  }
});

it.each(["focus", "visibility"])("reads immediately on %s after reaching the slow cadence", async event => {
  vi.useFakeTimers();
  let visible = true;
  let wake = () => {};
  const load = vi.fn().mockResolvedValue({balance: 1250});
  const received = vi.fn();
  const stop = startBankUpdates({
    load, onData: received, onError: vi.fn(), isVisible: () => visible,
    subscribeWake: listener => { wake = listener; return () => {}; },
  });

  try {
    await vi.advanceTimersByTimeAsync(0);
    for (let update = 0; update < 12; update++) {
      await vi.advanceTimersToNextTimerAsync();
    }
    await vi.advanceTimersByTimeAsync(10000);
    expect(load).toHaveBeenCalledTimes(13);

    if (event === "visibility") {
      visible = false;
      wake();
      await vi.advanceTimersByTimeAsync(120000);
      expect(load).toHaveBeenCalledTimes(13);
      visible = true;
    }
    wake();
    await vi.advanceTimersByTimeAsync(0);
    expect(load).toHaveBeenCalledTimes(14);
    expect(received).toHaveBeenCalledTimes(14);
  } finally {
    stop();
  }
});

it("keeps explicit authorization pending at 10 seconds and slows after authorization completes", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  let status = "pending";
  const times: number[] = [];
  const load = vi.fn(async () => {
    times.push(Date.now());
    return {status};
  });
  const received = vi.fn();
  const options = {
    load, onData: received, onError: vi.fn(), isVisible: () => true,
    subscribeWake: () => () => {},
    needsFastUpdates: (data: {status: string}) => data.status === "pending",
  };
  const stop = startBankUpdates(options);

  try {
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(600000);
    expect(load).toHaveBeenCalledTimes(61);
    expect(received).toHaveBeenCalledTimes(61);
    expect(times.slice(1).every((time, index) => time - times[index] === 10000)).toBe(true);

    status = "active";
    await vi.advanceTimersByTimeAsync(10000);
    expect(received).toHaveBeenLastCalledWith({status: "active"});
    for (let update = 0; update < 12; update++) {
      await vi.advanceTimersToNextTimerAsync();
    }
    expect(times.at(-1)! - times.at(-2)!).toBe(60000);

    status = "pending";
    await vi.advanceTimersToNextTimerAsync();
    const readsWithNewPending = load.mock.calls.length;
    await vi.advanceTimersByTimeAsync(10000);
    expect(load).toHaveBeenCalledTimes(readsWithNewPending + 1);
    expect(received).toHaveBeenLastCalledWith({status: "pending"});
  } finally {
    stop();
  }
});

it("preserves error backoff at 20, 40, then 60 seconds and recovers with the correct callbacks", async () => {
  vi.useFakeTimers();
  const failures = Array.from({length: 4}, (_, index) => new Error(`offline ${index + 1}`));
  const load = vi.fn()
    .mockRejectedValueOnce(failures[0])
    .mockRejectedValueOnce(failures[1])
    .mockRejectedValueOnce(failures[2])
    .mockRejectedValueOnce(failures[3])
    .mockResolvedValue({balance: 1250});
  const received = vi.fn();
  const onError = vi.fn();
  const stop = startBankUpdates({
    load, onData: received, onError, isVisible: () => true,
    subscribeWake: () => () => {},
  });

  try {
    await vi.advanceTimersByTimeAsync(0);
    for (const [index, delay] of [20000, 40000, 60000, 60000].entries()) {
      expect(onError).toHaveBeenNthCalledWith(index + 1, failures[index]);
      expect(received).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(load).toHaveBeenCalledTimes(index + 1);
      await vi.advanceTimersByTimeAsync(1);
      expect(load).toHaveBeenCalledTimes(index + 2);
    }
    expect(onError).toHaveBeenCalledTimes(4);
    expect(received).toHaveBeenCalledExactlyOnceWith({balance: 1250});
    await vi.advanceTimersByTimeAsync(9999);
    expect(load).toHaveBeenCalledTimes(5);
    await vi.advanceTimersByTimeAsync(1);
    expect(load).toHaveBeenCalledTimes(6);
    expect(received).toHaveBeenCalledTimes(2);
  } finally {
    stop();
  }
});

it("uses the existing error backoff when a read fails after the idle cadence", async () => {
  vi.useFakeTimers();
  let fail = false;
  const failure = new Error("offline");
  const load = vi.fn(async () => {
    if (fail) throw failure;
    return {balance: 1250};
  });
  const received = vi.fn();
  const onError = vi.fn();
  const stop = startBankUpdates({
    load, onData: received, onError, isVisible: () => true,
    subscribeWake: () => () => {},
  });

  try {
    await vi.advanceTimersByTimeAsync(0);
    for (let update = 0; update < 12; update++) {
      await vi.advanceTimersToNextTimerAsync();
    }
    fail = true;
    await vi.advanceTimersToNextTimerAsync();
    expect(onError).toHaveBeenCalledExactlyOnceWith(failure);
    expect(received).toHaveBeenCalledTimes(13);

    await vi.advanceTimersByTimeAsync(19999);
    expect(load).toHaveBeenCalledTimes(14);
    await vi.advanceTimersByTimeAsync(1);
    expect(load).toHaveBeenCalledTimes(15);
    expect(onError).toHaveBeenCalledTimes(2);
    expect(received).toHaveBeenCalledTimes(13);
  } finally {
    stop();
  }
});

it("reports unavailable data once and does not resume reads from timers or wake events", async () => {
  vi.useFakeTimers();
  let wake = () => {};
  const load = vi.fn().mockResolvedValue(null);
  const received = vi.fn();
  const onError = vi.fn();
  const stop = startBankUpdates({
    load, onData: received, onError, isVisible: () => true,
    subscribeWake: listener => { wake = listener; return () => {}; },
  });

  try {
    await vi.advanceTimersByTimeAsync(0);
    expect(received).toHaveBeenCalledExactlyOnceWith(null);
    wake();
    await vi.advanceTimersByTimeAsync(180000);
    expect(load).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    stop();
  }
});

it("aborts a pending read and ignores its late rejection after cleanup", async () => {
  vi.useFakeTimers();
  let wake = () => {};
  let rejectRead: (error: Error) => void = () => {};
  let signal: AbortSignal | undefined;
  const load = vi.fn((readSignal: AbortSignal) => {
    signal = readSignal;
    return new Promise<object>((_, reject) => { rejectRead = reject; });
  });
  const received = vi.fn();
  const onError = vi.fn();
  const unsubscribe = vi.fn();
  const stop = startBankUpdates({
    load, onData: received, onError, isVisible: () => true,
    subscribeWake: listener => { wake = listener; return unsubscribe; },
  });

  stop();
  expect(signal?.aborted).toBe(true);
  expect(unsubscribe).toHaveBeenCalledOnce();
  rejectRead(new Error("aborted"));
  wake();
  await vi.advanceTimersByTimeAsync(180000);
  expect(load).toHaveBeenCalledTimes(1);
  expect(received).not.toHaveBeenCalled();
  expect(onError).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it("does not log or persist bank data while comparing snapshots and refreshing", async () => {
  vi.useFakeTimers();
  const consoleMethods = ["log", "info", "warn", "error", "debug", "table", "dir"] as const;
  const output = consoleMethods.map(method => vi.spyOn(console, method).mockImplementation(() => {}));
  const localWrites = vi.fn();
  const sessionWrites = vi.fn();
  const databaseAccess = vi.fn();
  vi.stubGlobal("localStorage", {setItem: localWrites});
  vi.stubGlobal("sessionStorage", {setItem: sessionWrites});
  vi.stubGlobal("indexedDB", {open: databaseAccess});
  const bankData = {account: "synthetic-private-account", balance: 1250};
  const load = vi.fn(async () => ({...bankData}));
  const received = vi.fn();
  const stop = startBankUpdates({
    load, onData: received, onError: vi.fn(), isVisible: () => true,
    subscribeWake: () => () => {},
  });

  try {
    await vi.advanceTimersByTimeAsync(0);
    for (let update = 0; update < 12; update++) {
      await vi.advanceTimersToNextTimerAsync();
    }
    bankData.balance = 1400;
    await vi.advanceTimersToNextTimerAsync();

    expect(received).toHaveBeenLastCalledWith(bankData);
    expect(load).toHaveBeenCalledTimes(14);
    for (const method of output) expect(method).not.toHaveBeenCalled();
    expect(localWrites).not.toHaveBeenCalled();
    expect(sessionWrites).not.toHaveBeenCalled();
    expect(databaseAccess).not.toHaveBeenCalled();
  } finally {
    stop();
  }
});
