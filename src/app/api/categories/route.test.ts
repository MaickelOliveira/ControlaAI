import {beforeEach,expect,it,vi} from "vitest";
import {NextRequest} from "next/server";
vi.mock("server-only",()=>({}));
const m=vi.hoisted(()=>({session:vi.fn(),owner:vi.fn(),scope:vi.fn(),save:vi.fn(),invalidate:vi.fn()}));
vi.mock("@/lib/auth",()=>({getSession:m.session,invalidateUserAuthCache:m.invalidate}));
vi.mock("@/lib/users",()=>({getUserById:m.owner}));
vi.mock("@/lib/workspace-categories",()=>({workspaceCategoryUser:m.scope,saveWorkspaceCategories:m.save}));
import {POST} from "./route";
const request=(name:unknown,type:unknown="expense")=>new NextRequest("https://fixture.test/api/categories",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name,type})});
beforeEach(()=>{vi.resetAllMocks();m.session.mockResolvedValue({sub:"fixture-owner",role:"client"});m.owner.mockResolvedValue({id:"fixture-owner"});m.scope.mockResolvedValue({id:"fixture-owner",customCategoriesExpense:["Empresa"],customCategoriesIncome:[]});});
it("saves to the authenticated workspace and makes the new category immediately valid",async()=>{
 const response=await POST(request("  Nova  "));expect(response.status).toBe(200);expect(await response.json()).toEqual({ok:true,name:"Nova"});
 expect(m.save).toHaveBeenCalledExactlyOnceWith("fixture-owner",{customCategoriesExpense:["Empresa","Nova"]});expect(m.invalidate).toHaveBeenCalledWith("fixture-owner");
 expect(m.invalidate.mock.invocationCallOrder[0]).toBeGreaterThan(m.save.mock.invocationCallOrder[0]);
});
it("requires a client and rejects malformed names and duplicate defaults",async()=>{
 m.session.mockResolvedValueOnce(null);expect((await POST(request("Nova"))).status).toBe(401);
 for(const name of [null,12,{},"", "x".repeat(101),"Bad\nName"])expect((await POST(request(name))).status).toBe(400);
 expect((await POST(request("Outros"))).status).toBe(409);expect((await POST(request("empresa"))).status).toBe(409);
 expect((await POST(request("Nova","other"))).status).toBe(400);expect(m.save).not.toHaveBeenCalled();
});
