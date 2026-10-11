import {afterEach,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
vi.mock("./auth",()=>({getSessionWithUser:vi.fn()}));
vi.mock("./open-finance-access",()=>({getOpenFinanceAccess:vi.fn(),requireOpenFinanceOrigin:vi.fn()}));
const m=vi.hoisted(()=>({rpc:vi.fn(),headers:[] as Array<Record<string,string>>}));
vi.mock("./supabase",()=>({getSupabase:()=>({rpc:m.rpc})}));
import {openFinanceRpc} from "./open-finance-http";
afterEach(()=>{vi.unstubAllEnvs();m.rpc.mockReset();m.headers.length=0;});
it("sets verified owner/company on each independent RPC builder and blocks missing scope",async()=>{
 vi.stubEnv("MULTI_COMPANY_ENABLED","true");
 m.rpc.mockImplementation(()=>{const headers:Record<string,string>={};m.headers.push(headers);const result={setHeader:(key:string,value:string)=>{headers[key]=value;return result;},then:(resolve:(value:unknown)=>unknown)=>Promise.resolve({data:{ok:true}}).then(resolve)};return result;});
 const base={userId:"owner",mode:"business" as const,environment:"production" as const};
 await Promise.all(["company-a","company-b"].map(companyId=>openFinanceRpc({...base,companyId},"zelo_of_overview",{p_user:"spoof",p_mode:"personal"})));
 expect(m.headers).toEqual([{"x-zelo-owner":"owner","x-zelo-company":"company-a"},{"x-zelo-owner":"owner","x-zelo-company":"company-b"}]);
 expect(m.rpc).toHaveBeenCalledWith("zelo_of_overview",{p_user:"owner",p_mode:"business"});
 await expect(openFinanceRpc(base,"zelo_of_report")).rejects.toThrow("OF_COMPANY_SCOPE_MISSING");
});
it("keeps the legacy RPC unchanged while multi-company is disabled",async()=>{
 vi.stubEnv("MULTI_COMPANY_ENABLED","false");m.rpc.mockResolvedValue({data:42});
 expect(await openFinanceRpc({userId:"owner",mode:"personal",environment:"production"},"zelo_of_report")).toBe(42);
});
