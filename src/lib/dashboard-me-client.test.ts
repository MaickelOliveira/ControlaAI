import {afterEach,expect,it,vi} from "vitest";
afterEach(()=>vi.unstubAllGlobals());
it("shares pending identity reads, then checks the current mode on a later page",async()=>{
  vi.resetModules();
  let finish!:(value:Response)=>void;
  const fetch=vi.fn().mockReturnValueOnce(new Promise<Response>(resolve=>{finish=resolve;})).mockResolvedValueOnce(Response.json({user:{activeMode:"business"}}));
  vi.stubGlobal("fetch",fetch);
  const {fetchDashboardMe}=await import("./dashboard-me-client");
  const first=fetchDashboardMe(),second=fetchDashboardMe();
  finish(Response.json({user:{activeMode:"personal"}}));
  const initial=await Promise.all([first,second]);
  expect(initial.map(data=>data.user?.activeMode)).toEqual(["personal","personal"]);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect((await fetchDashboardMe()).user?.activeMode).toBe("business");
  expect(fetch).toHaveBeenCalledTimes(2);
});
