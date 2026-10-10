import {afterEach,expect,it,vi} from "vitest";
import {startBankUpdates} from "./open-finance-live";
afterEach(()=>vi.useRealTimers());
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
