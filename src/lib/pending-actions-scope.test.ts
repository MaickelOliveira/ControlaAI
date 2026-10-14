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
it("retains Google commit identities longer than selection prompts without rebasing their payloads",async()=>{
 const owner="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",company="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",mutation="dddddddd-dddd-4ddd-8ddd-ddddddddddd1";
 m.scope.mockResolvedValue({userId:owner,companyId:company,mode:"business"});const started=Date.now();
 const intent={clientMutationId:mutation,workspace:{userId:owner,companyId:company,mode:"business" as const},operation:"create_appointment" as const,appointmentId:null,expectedGoogleSyncVersion:null,payload:{title:"Fixture",startAt:"2026-10-14T15:00:00Z"}};
 await setPendingAction("5511",{type:"google_agenda_commit",intent:"agenda_create",userId:owner,intents:[intent],receipts:[]});
 const stored=m.upsert.mock.calls[0][0].data;expect(stored.intents).toEqual([intent]);expect(stored.receipts).toEqual([]);expect(stored.workspaceMode).toBe("business");expect(stored.companyId).toBe(company);
 expect(Date.parse(stored.expiresAt)).toBeGreaterThanOrEqual(started+24*60*60*1000);expect(Date.parse(stored.expiresAt)).toBeLessThanOrEqual(Date.now()+24*60*60*1000);
});
