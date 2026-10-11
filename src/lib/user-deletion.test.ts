import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({eq:vi.fn()}));
vi.mock("./supabase",()=>({getSupabase:()=>({from:()=>({delete:()=>({eq:m.eq})})})}));
import {deleteUser} from "./users";
beforeEach(()=>vi.resetAllMocks());
it("does not report success when the database preserves a customer's bank history",async()=>{
  m.eq.mockResolvedValue({error:{message:"OF_CLIENT_HISTORY_PROTECTED"}});
  await expect(deleteUser("client")).rejects.toThrow("OF_CLIENT_HISTORY_PROTECTED");
});
it("does not expose database details and retains deletion for customers without bank history",async()=>{
  m.eq.mockResolvedValueOnce({error:{message:"private database details"}}).mockResolvedValueOnce({error:null});
  await expect(deleteUser("client")).rejects.toThrow("USER_DELETE_FAILED");await expect(deleteUser("client")).resolves.toBeUndefined();
});
