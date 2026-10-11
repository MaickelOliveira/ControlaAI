import {afterEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({user:vi.fn(),token:""}));
vi.mock("next/headers",()=>({cookies:async()=>({get:(name:string)=>name==="ca_session"?{value:m.token}:undefined})}));
vi.mock("./users",()=>({getUserById:m.user,hasAccess:()=>true}));
afterEach(()=>vi.unstubAllEnvs());
it("invalidates the holder cache across independently loaded route modules",async()=>{
 vi.stubEnv("JWT_SECRET","fixture-auth-cache-test-only-secret-long-enough");vi.resetModules();
 const first=await import("./auth");first.invalidateUserAuthCache("auth-cache-fixture");
 m.token=await first.signToken({sub:"auth-cache-fixture",name:"Fixture",email:"fixture@example.test",plan:"business",role:"client"});
 m.user.mockResolvedValue({id:"auth-cache-fixture",activeMode:"business"});
 expect((await first.getSessionWithUser())?.user.activeMode).toBe("business");
 vi.resetModules();const second=await import("./auth");
 expect((await second.getSessionWithUser())?.user.activeMode).toBe("business");expect(m.user).toHaveBeenCalledTimes(1);
 m.user.mockResolvedValue({id:"auth-cache-fixture",activeMode:"personal"});second.invalidateUserAuthCache("auth-cache-fixture");
 expect((await first.getSessionWithUser())?.user.activeMode).toBe("personal");expect(m.user).toHaveBeenCalledTimes(2);
 first.invalidateUserAuthCache("auth-cache-fixture");
});
