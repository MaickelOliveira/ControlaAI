import {beforeEach,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
const deps=vi.hoisted(()=>({rpc:vi.fn(),page:vi.fn()}));
vi.mock("./open-finance-http",()=>({openFinanceRpc:deps.rpc}));
vi.mock("./polp-production",async original=>({...await original<typeof import("./polp-production")>(),polpProductionPage:deps.page}));
import {readProductionSyncStatus} from "./open-finance-sync-status";
const id="00000000-0000-4000-8000-000000000001",consent="00000000-0000-4000-8000-000000000002";
const scope={userId:id,mode:"personal" as const,environment:"production" as const};
beforeEach(()=>{vi.resetAllMocks();deps.rpc.mockResolvedValue({status:"active",external_consent_id:consent});deps.page.mockResolvedValue({data:[{consent_id:consent,resource:"credit_card.transactions",resource_id:"private-resource",last_sync_at:"2026-11-02T10:00:00Z",next_sync_at:"2026-11-02T22:00:00Z",extra:"private"}],nextCursor:null});});
it("reads the provider schedule only after the scoped ownership check and returns no private identifiers",async()=>{
 const result=await readProductionSyncStatus(scope,id);
 expect(deps.rpc).toHaveBeenCalledWith(scope,"zelo_of_connection",{p_id:id});
 expect(deps.page).toHaveBeenCalledWith(`/consents/${consent}/sync-schedules`,null);
 expect(result).toEqual({items:[{resource:"credit_card.transactions",lastSync:"2026-11-02T10:00:00Z",nextSync:"2026-11-02T22:00:00Z"}]});
 expect(JSON.stringify(result)).not.toContain("private");
});
it("never contacts the provider for another client's, archived or inactive connection",async()=>{
 deps.rpc.mockRejectedValue(Error("OF_CONNECTION_NOT_FOUND"));await expect(readProductionSyncStatus(scope,id)).rejects.toThrow();expect(deps.page).not.toHaveBeenCalled();
 deps.rpc.mockResolvedValue({status:"revoked",external_consent_id:consent});await expect(readProductionSyncStatus(scope,id)).rejects.toThrow();expect(deps.page).not.toHaveBeenCalled();
});
it("rejects unrelated provider identities and malformed dates instead of claiming a successful refresh",async()=>{
 deps.page.mockResolvedValue({data:[{consent_id:id,resource:"credit_card.transactions",last_sync_at:null,next_sync_at:null}],nextCursor:null});await expect(readProductionSyncStatus(scope,id)).rejects.toThrow("INVALID_SYNC_STATUS");
 deps.page.mockResolvedValue({data:[{consent_id:consent,resource:"credit_card.transactions",last_sync_at:"not-a-date",next_sync_at:null}],nextCursor:null});await expect(readProductionSyncStatus(scope,id)).rejects.toThrow("INVALID_SYNC_STATUS");
});
