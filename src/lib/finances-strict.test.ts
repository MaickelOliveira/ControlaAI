import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({from:vi.fn(),select:vi.fn(),eq:vi.fn(),gte:vi.fn(),lte:vi.fn(),order:vi.fn(),range:vi.fn()}));
vi.mock("./supabase",()=>({getSupabase:()=>({from:m.from})}));
import {getFinancesInRangeStrict as getFinancesInRange} from "./finances";
beforeEach(()=>{vi.resetAllMocks();for(const key of ["from","select","eq","gte","lte","order"] as const)m[key].mockReturnValue(m);});
const row=(id:string)=>({id,user_id:"own",mode:"personal",type:"expense",amount:10,category:"Outros",description:"Test",date:"2026-09-10",source:"web",pending:false});
it("rejects missing manual records instead of inventing an empty ledger",async()=>{
  m.range.mockResolvedValue({data:null,error:{message:"private"}});
  await expect(getFinancesInRange("own","personal","2026-09-01","2026-09-30")).rejects.toThrow();
});
it("reads every manual page with own identity, mode and period even under a smaller server row limit",async()=>{
  m.range.mockResolvedValueOnce({data:[row("a")],count:2}).mockResolvedValueOnce({data:[row("b")],count:2});
  expect((await getFinancesInRange("own","personal","2026-09-01","2026-09-30")).map(f=>f.id)).toEqual(["a","b"]);
  expect(m.eq).toHaveBeenCalledWith("user_id","own");expect(m.eq).toHaveBeenCalledWith("mode","personal");expect(m.range.mock.calls).toEqual([[0,199],[1,200]]);
});
it("refuses incomplete, duplicate or oversized page results",async()=>{
  for(const response of [{data:[],count:2},{data:[row("a"),row("a")],count:2},{data:[],count:10001}]){
    m.range.mockResolvedValue(response);await expect(getFinancesInRange("own","personal","2026-09-01","2026-09-30")).rejects.toThrow();
  }
});
