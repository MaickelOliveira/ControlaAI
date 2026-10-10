import { afterEach, beforeEach, expect, it, vi } from "vitest";
beforeEach(()=>vi.resetModules());
afterEach(()=>vi.unstubAllGlobals());
async function me(previewOnly:boolean,previewBusinessEnabled:boolean,storedMode:string){
  const user={name:"Owner",plan:"personal",status:"active",activeMode:"personal",trialEndsAt:"",previewOnly,previewBusinessEnabled};
  const fetchMock=vi.fn(async()=>({ok:true,json:async()=>({user})}));
  vi.stubGlobal("fetch",fetchMock);
  vi.stubGlobal("sessionStorage",{getItem:vi.fn(()=>storedMode)});
  const result=await (await import("./dashboard-me-client")).fetchDashboardMe();
  return {result,user,fetchMock};
}
it("remembers the private PF/PJ selection without changing the production plan or profile",async()=>{
  const {result,user,fetchMock}=await me(true,true,"business");
  expect(result.user?.activeMode).toBe("business");
  expect(result.user?.plan).toBe("personal");
  expect(user.activeMode).toBe("personal");
  expect(fetchMock.mock.calls).toEqual([["/api/me"]]);
});
it("never applies a preview preference to the production dashboard",async()=>{
  expect((await me(false,true,"business")).result.user?.activeMode).toBe("personal");
});
it("does not select PJ unless the private server response permits it",async()=>{
  expect((await me(true,false,"business")).result.user?.activeMode).toBe("personal");
});
it("ignores an invalid stored mode",async()=>{
  expect((await me(true,true,"other")).result.user?.activeMode).toBe("personal");
});
