import {beforeEach,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
const rpc=vi.hoisted(()=>vi.fn());vi.mock("./open-finance-http",()=>({openFinanceRpc:rpc}));
import {readBankLedger} from "./finance-ledger-storage";
const scope={userId:"user",mode:"business" as const,environment:"production" as const};
beforeEach(()=>{rpc.mockReset();});
it("includes account movements beyond the first report page",async()=>{
 rpc.mockImplementation(async(_s,op,p)=>op==="zelo_of_overview"?{connections:[]}:({from:"2026-10-01",to:"2026-10-31",movements:[{id:p.p_after?"second":"first"}],next:p.p_after?null:"cursor"}));
 const data=await readBankLedger(scope,{from:"2026-10-01",to:"2026-10-31"});expect(data.report.movements.map(m=>m.id)).toEqual(["first","second"]);
});
it("refuses a repeated cursor instead of claiming a complete ledger",async()=>{
 rpc.mockImplementation(async(_s,op)=>op==="zelo_of_overview"?{}:{movements:[],next:"same"});
 await expect(readBankLedger(scope,{from:"2026-10-01",to:"2026-10-31"})).rejects.toThrow();
});
it("keeps an intermediate storage error visible instead of returning a partial total",async()=>{
 rpc.mockImplementation(async(_s,op,p)=>{if(op==="zelo_of_overview")return {};if(p.p_after)throw Error("OFFLINE");return {movements:[{id:"first"}],next:"second"};});
 await expect(readBankLedger(scope,{from:"2026-10-01",to:"2026-10-31"})).rejects.toThrow("OFFLINE");
});
