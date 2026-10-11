import {afterEach,expect,it,vi} from "vitest";
import {updateDashboardMode} from "./dashboard-me-client";
afterEach(()=>vi.unstubAllGlobals());
it("accepts a mode only after the server confirms it was saved",async()=>{const fetch=vi.fn().mockResolvedValue({ok:true,json:async()=>({ok:true,activeMode:"personal"})});vi.stubGlobal("fetch",fetch);await expect(updateDashboardMode("personal")).resolves.toBeUndefined();expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({mode:"personal"});});
it("rejects an unsuccessful update so the UI does not reload into the previous mode",async()=>{vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:false,json:async()=>({error:"Não autorizado"})}));await expect(updateDashboardMode("personal")).rejects.toThrow();});
it("rejects a successful HTTP response that did not persist the requested mode",async()=>{vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,json:async()=>({ok:true,activeMode:"business"})}));await expect(updateDashboardMode("personal")).rejects.toThrow();});
