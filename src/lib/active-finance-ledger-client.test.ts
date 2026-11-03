import {afterEach,expect,it,vi} from "vitest";
import {fetchActiveFinanceLedger,createActiveFinanceLedgerReader} from "./active-finance-ledger-client";
afterEach(()=>vi.unstubAllGlobals());
it("starts the active ledger directly without an identity lookup or a guessed personal mode",async()=>{
 let finish!:(value:Response)=>void;
 const fetch=vi.fn(()=>new Promise<Response>(resolve=>{finish=resolve;}));vi.stubGlobal("fetch",fetch);
 const signal=new AbortController().signal,pending=fetchActiveFinanceLedger(signal,"2026-11-01","2026-11-30");
 expect(fetch).toHaveBeenCalledExactlyOnceWith("/api/finances/ledger?from=2026-11-01&to=2026-11-30",{cache:"no-store",signal});
 finish(Response.json({mode:"business",finances:[]}));expect(await pending).toMatchObject({mode:"business"});
});
it("reads the current server-selected mode afresh after switching workspaces",async()=>{
 const fetch=vi.fn().mockResolvedValueOnce(Response.json({mode:"business",finances:[{id:"company-a"}]})).mockResolvedValueOnce(Response.json({mode:"personal",finances:[{id:"personal"}]}));vi.stubGlobal("fetch",fetch);
 const signal=new AbortController().signal;
 expect(await fetchActiveFinanceLedger(signal,"2026-11-01","2026-11-30")).toMatchObject({mode:"business"});
 expect(await fetchActiveFinanceLedger(signal,"2026-11-01","2026-11-30")).toMatchObject({mode:"personal",finances:[{id:"personal"}]});expect(fetch).toHaveBeenCalledTimes(2);
});
it("preserves unavailable/unauthorized responses and refuses to guess missing mode metadata",async()=>{
 const fetch=vi.fn().mockResolvedValueOnce(new Response(null,{status:401})).mockResolvedValueOnce(Response.json({error:"Não disponível"},{status:503})).mockResolvedValueOnce(Response.json({finances:[]}));vi.stubGlobal("fetch",fetch);
 const signal=new AbortController().signal;
 expect(await fetchActiveFinanceLedger(signal,"2026-11-01","2026-11-30")).toBeNull();
 await expect(fetchActiveFinanceLedger(signal,"2026-11-01","2026-11-30")).rejects.toThrow("Não disponível");
 await expect(fetchActiveFinanceLedger(signal,"2026-11-01","2026-11-30")).rejects.toThrow("LEDGER_MODE_UNAVAILABLE");
});

it("keeps each mounted tab in its chosen mode while a new page resolves the latest server choice",async()=>{
 let selected="personal";
 const fetch=vi.fn(async(input:string)=>Response.json({mode:new URL(input,"https://zelo.test").searchParams.get("mode")??selected,finances:[]}));vi.stubGlobal("fetch",fetch);
 const tabA=createActiveFinanceLedgerReader(),tabB=createActiveFinanceLedgerReader(),signal=new AbortController().signal;
 expect((await tabA(signal,"2026-11-01","2026-11-30"))?.mode).toBe("personal");selected="business";
 expect((await tabA(signal,"2026-12-01","2026-12-31"))?.mode).toBe("personal");
 expect((await tabB(signal,"2026-11-01","2026-11-30"))?.mode).toBe("business");
 expect(fetch.mock.calls[1][0]).toContain("mode=personal");expect(fetch.mock.calls[2][0]).not.toContain("mode=");
});
it("does not pin an aborted initial response or reuse a completed financial snapshot",async()=>{
 const fetch=vi.fn().mockResolvedValueOnce(Response.json({mode:"personal",finances:[]})).mockResolvedValueOnce(Response.json({mode:"business",finances:[]})).mockResolvedValueOnce(Response.json({mode:"business",finances:[{id:"fresh"}]}));vi.stubGlobal("fetch",fetch);
 const read=createActiveFinanceLedgerReader(),cancelled=new AbortController();cancelled.abort();
 await read(cancelled.signal,"2026-11-01","2026-11-30");
 expect((await read(new AbortController().signal,"2026-11-01","2026-11-30"))?.mode).toBe("business");
 expect((await read(new AbortController().signal,"2026-11-01","2026-11-30"))?.finances).toEqual([{id:"fresh"}]);expect(fetch.mock.calls[1][0]).not.toContain("mode=");
});
