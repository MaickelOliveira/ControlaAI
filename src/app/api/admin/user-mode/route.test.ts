import {beforeEach,expect,it,vi} from "vitest";
import {NextRequest} from "next/server";
const m=vi.hoisted(()=>({session:vi.fn(),invalidate:vi.fn(),update:vi.fn(),set:vi.fn()}));
vi.mock("@/lib/auth",()=>({getSession:m.session,invalidateUserAuthCache:m.invalidate}));
vi.mock("@/lib/users",()=>({updateUser:m.update}));
vi.mock("next/headers",()=>({cookies:async()=>({set:m.set})}));
import {PATCH} from "./route";
const request=(mode:unknown)=>new NextRequest("https://fixture.test/api/admin/user-mode",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({mode})});
beforeEach(()=>{vi.resetAllMocks();m.session.mockResolvedValue({role:"client",sub:"owner"});m.update.mockResolvedValue({id:"owner",activeMode:"business"});});
it("persists the browser's requested workspace immediately after a confirmed mode save",async()=>{
 const response=await PATCH(request("business"));expect(response.status).toBe(200);expect(await response.json()).toEqual({ok:true,activeMode:"business"});expect(m.set).toHaveBeenCalledWith("zelo_workspace_mode","owner:business",expect.objectContaining({httpOnly:true,path:"/"}));
});
it("does not report a successful switch or save a browser preference when storage failed",async()=>{
 m.update.mockResolvedValue(null);expect((await PATCH(request("business"))).status).toBe(503);expect(m.set).not.toHaveBeenCalled();
 m.session.mockResolvedValueOnce(null);expect((await PATCH(request("personal"))).status).toBe(401);expect((await PATCH(request("invalid"))).status).toBe(400);
});
