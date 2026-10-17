import {beforeEach,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
const rpc=vi.hoisted(()=>vi.fn());vi.mock("./open-finance-http",()=>({openFinanceRpc:rpc}));
import {readBankInstallmentAnchors,readBankLedger,readBankOverview} from "./finance-ledger-storage";
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

it("shares only a still-pending bank overview for simultaneous period reads",async()=>{
 let finish!:(value:unknown)=>void;
 const overview=new Promise(resolve=>{finish=resolve;});
 rpc.mockImplementation(async(_s,operation)=>operation==="zelo_of_overview"?overview:{movements:[],next:null});
 const first=readBankLedger(scope,{from:"2026-10-01",to:"2026-10-31"});
 const second=readBankLedger(scope,{from:"2026-09-01",to:"2026-09-30"});
 const overviewCalls=rpc.mock.calls.filter(c=>c[1]==="zelo_of_overview").length,reportCalls=rpc.mock.calls.filter(c=>c[1]==="zelo_of_report").length;
 finish({connections:[]});await Promise.all([first,second]);
 expect(overviewCalls).toBe(1);expect(reportCalls).toBe(2);
});

it("never combines overviews of different owners, companies or modes",async()=>{
 let finish!:(value:unknown)=>void;const pending=new Promise(resolve=>{finish=resolve;});
 rpc.mockImplementation(()=>pending);
 const scopes=[{...scope,userId:"owner-a",companyId:"a"},{...scope,userId:"owner-b",companyId:"a"},{...scope,userId:"owner-a",companyId:"b"},{...scope,userId:"owner-a",companyId:"a",mode:"personal" as const}];
 const reads=scopes.map(s=>readBankOverview(s));const calls=rpc.mock.calls.length;
 finish({connections:[]});await Promise.all(reads);
 expect(calls).toBe(4);
});

it("reads fresh data after completion and does not let a consumer mutate another response",async()=>{
 rpc.mockResolvedValue({connections:[{id:"first"}]});
 const first=readBankOverview(scope),second=readBankOverview(scope);
 const [a,b]=await Promise.all([first,second]);a.connections[0].id="changed-by-consumer";
 expect(b.connections[0].id).toBe("first");expect(rpc).toHaveBeenCalledTimes(1);
 rpc.mockResolvedValue({connections:[{id:"updated"}]});
 expect((await readBankOverview(scope)).connections[0].id).toBe("updated");expect(rpc).toHaveBeenCalledTimes(2);
});

it("folds complementary provider installment fragments in the account overview only",async()=>{
 const first={id:"first",kind:"installment",resource_id:"card",description:"DM*HOSTINGER.COM.BR",resource_name:"Card",institution_name:"Bank",due_date:null,amount:"43.71",currency:null,synced_at:"2026-10-17",purchase_date:"2026-07-13",source_ordinals:[1,2,3],total_installments:12,observed_installments:3,last_observed_installment:3,last_observed_month:"2026-09-01"};
 const rest={...first,id:"rest",description:"DM*HOSTINGER.COM.",amount:"43.61",source_ordinals:[4,5,6,7,8,9,10,11,12],observed_installments:9,last_observed_installment:4,last_observed_month:"2026-10-01"};
 rpc.mockResolvedValue({connections:[],agenda:{items:[first,rest],incomplete:false}});
 const overview=await readBankOverview(scope);
 expect(overview.agenda?.items).toHaveLength(1);
 expect(overview.agenda?.items[0]).toMatchObject({observed_installments:4,amount_varies:true});
});

it("clears a failed overview so a later request can recover",async()=>{
 rpc.mockRejectedValue(Error("OF_STORAGE_ERROR"));
 const failures=await Promise.allSettled([readBankOverview(scope),readBankOverview(scope)]);
 expect(failures.every(f=>f.status==="rejected")).toBe(true);expect(rpc).toHaveBeenCalledTimes(1);
 rpc.mockResolvedValue({connections:[]});await expect(readBankOverview(scope)).resolves.toEqual({connections:[]});
 expect(rpc).toHaveBeenCalledTimes(2);
});

it("rejects missing company scope before joining a shared read",async()=>{
 vi.stubEnv("MULTI_COMPANY_ENABLED","true");
 try{await expect(readBankOverview(scope)).rejects.toThrow("OF_COMPANY_SCOPE_MISSING");expect(rpc).not.toHaveBeenCalled();}
 finally{vi.unstubAllEnvs();}
});

it("reads only the authorized installment anchors and rejects an incomplete payload shape",async()=>{
 const item={id:"schedule",resource_id:"card",description:"Loja",resource_name:"Gold",institution_name:"Banco",amount:"12.00",currency:"BRL",bill_month:"2026-10-01",observed_installments:2,total_installments:4,synced_at:"2026-10-15T12:00:00Z"};
 rpc.mockResolvedValue({items:[item],incomplete:false});
 await expect(readBankInstallmentAnchors(scope)).resolves.toEqual({items:[item],incomplete:false});
 expect(rpc).toHaveBeenCalledExactlyOnceWith(scope,"zelo_of_installment_anchors");
 rpc.mockResolvedValue({items:[{...item,description:undefined}],incomplete:false});
 await expect(readBankInstallmentAnchors(scope)).rejects.toThrow("OF_INSTALLMENT_ANCHORS_INVALID");
});
