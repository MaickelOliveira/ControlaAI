import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({scope:vi.fn(),upsert:vi.fn()}));
vi.mock("./supabase",()=>({resolveCompanyDatabaseScope:m.scope,getSupabase:()=>({from:()=>({upsert:m.upsert})})}));
import {setPendingAction} from "./pending-actions";
beforeEach(()=>{vi.clearAllMocks();m.upsert.mockResolvedValue({error:null});});
it("stores the verified personal workspace for multi-turn actions without trusting supplied metadata",async()=>{
 m.scope.mockResolvedValue({userId:"owner",companyId:"anchor",mode:"personal"});
 await setPendingAction("5511",{type:"recurring_confirmation",userId:"owner",recurringId:"r",description:"Farmácia",amount:50,companyId:"foreign",workspaceMode:"business"});
 expect(m.upsert).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({userId:"owner",companyId:"anchor",workspaceMode:"personal"})}));
 m.scope.mockResolvedValue({userId:"foreign",companyId:"anchor",mode:"personal"});
 await expect(setPendingAction("5511",{type:"recurring_confirmation",userId:"owner",recurringId:"r",description:"Farmácia",amount:50})).rejects.toThrow("COMPANY_OWNER_MISMATCH");
 expect(m.upsert).toHaveBeenCalledTimes(1);
});
