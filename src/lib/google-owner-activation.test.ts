import {beforeEach,expect,it,vi} from "vitest";
const deps=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("./supabase",()=>({getSupabase:()=>deps}));
import {loadGoogleOwnerActivation} from "./google-owner-activation";
const owner="AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAA1";
beforeEach(()=>deps.rpc.mockReset().mockResolvedValue({data:false,error:null}));
it("loads the canonical authenticated owner and returns strict sticky status",async()=>{
 expect(await loadGoogleOwnerActivation(owner)).toBe(false);
 expect(deps.rpc).toHaveBeenCalledWith("zelo_google_owner_activated",{p_user_id:owner.toLowerCase()});
 deps.rpc.mockResolvedValue({data:true,error:null});expect(await loadGoogleOwnerActivation(owner)).toBe(true);
});
it.each([null,"", "other-owner",{},true])("rejects an invalid owner before private storage %#",async owner=>{
 await expect(loadGoogleOwnerActivation(owner as string)).rejects.toThrow("GOOGLE_ACTIVATION_STORAGE_INVALID");expect(deps.rpc).not.toHaveBeenCalled();
});
it.each([null,undefined,"false",0,{},[true]])("never interprets malformed activation as legacy permission %#",async data=>{
 deps.rpc.mockResolvedValue({data,error:null});await expect(loadGoogleOwnerActivation(owner)).rejects.toThrow("GOOGLE_ACTIVATION_STORAGE_INVALID");
});
it("strips raw database diagnostics and exception causes",async()=>{
 deps.rpc.mockRejectedValue(Object.assign(Error("private fixture diagnostic"),{cause:"private fixture cause"}));
 const error=await loadGoogleOwnerActivation(owner).catch(error=>error);
 expect(error).toBeInstanceOf(Error);expect(error.message).toBe("GOOGLE_ACTIVATION_STORAGE_UNAVAILABLE");expect(error).not.toHaveProperty("cause");expect(error.stack).not.toContain("private fixture");
 deps.rpc.mockResolvedValue({data:false,error:{message:"private fixture diagnostic"}});
 await expect(loadGoogleOwnerActivation(owner)).rejects.toThrow("GOOGLE_ACTIVATION_STORAGE_UNAVAILABLE");
});
