import {beforeEach,expect,it,vi} from "vitest";
import bcrypt from "bcryptjs";
const m=vi.hoisted(()=>({session:vi.fn(),remove:vi.fn(),user:vi.fn(),update:vi.fn(),invalidate:vi.fn(),limit:vi.fn()}));
vi.mock("@/lib/auth",()=>({getAdminSession:m.session,invalidateUserAuthCache:m.invalidate}));
vi.mock("@/lib/users",()=>({
  getUserById:m.user,updateUser:m.update,deleteUser:m.remove,activateUser:vi.fn(),deactivateUser:vi.fn(),
  hasAccess:(user:{status:string})=>user.status==="active",
}));
vi.mock("@/lib/rate-limit",()=>({checkRateLimit:m.limit}));
import {DELETE,PATCH} from "./route";
import {NextRequest} from "next/server";
const remove=()=>DELETE(new NextRequest("https://zelo.example/api/admin/clientes/client",{method:"DELETE"}),{params:Promise.resolve({id:"client"})});
const setPassword=(newPassword:unknown)=>PATCH(new NextRequest("https://zelo.example/api/admin/clientes/client",{
  method:"PATCH",body:JSON.stringify({action:"set_password",newPassword}),
}),{params:Promise.resolve({id:"client"})});
beforeEach(()=>{
  vi.resetAllMocks();
  m.session.mockResolvedValue({role:"admin"});
  m.user.mockResolvedValue({status:"active",email:"cliente@example.test"});
  m.limit.mockResolvedValue(true);
});
it("only permits the administrator to request deletion",async()=>{
  m.session.mockResolvedValue({role:"user"});expect((await remove()).status).toBe(401);expect(m.remove).not.toHaveBeenCalled();
});
it("explains that bank history must be preserved and deactivation cancels the bank links",async()=>{
  m.remove.mockRejectedValue(Error("OF_CLIENT_HISTORY_PROTECTED"));const response=await remove();
  expect(response.status).toBe(409);expect((await response.json()).error).toContain("Desativar");
});
it("returns a generic failure on storage errors and success only for confirmed deletion",async()=>{
  m.remove.mockRejectedValueOnce(Error("private detail")).mockResolvedValueOnce(undefined);
  const response=await remove();expect(response.status).toBe(503);expect(JSON.stringify(await response.json())).not.toContain("private detail");
  expect((await remove()).status).toBe(200);
});

it("saves the administrator's choice as a hash and invalidates affected sessions",async()=>{
  const password = "Acesso-teste-2026";
  m.update.mockResolvedValue({});
  const response = await setPassword(password);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ok:true});
  const [id, patch] = m.update.mock.calls[0];
  expect(id).toBe("client");
  expect(patch).toEqual({passwordHash:expect.any(String),passwordChangedAt:expect.any(String)});
  expect(patch.passwordHash).not.toBe(password);
  expect(await bcrypt.compare(password,patch.passwordHash)).toBe(true);
  expect(m.invalidate).toHaveBeenCalledWith("client");
});

it("rejects unauthorized, invalid and throttled password changes before writing",async()=>{
  m.session.mockResolvedValueOnce({role:"client"});
  expect((await setPassword("Acesso-teste-2026")).status).toBe(401);
  m.user.mockResolvedValueOnce({status:"inactive",email:"cliente@example.test"});
  expect((await setPassword("Acesso-teste-2026")).status).toBe(409);
  expect((await setPassword("curta")).status).toBe(400);
  expect((await setPassword("🙂".repeat(19))).status).toBe(400);
  m.limit.mockResolvedValueOnce(false);
  expect((await setPassword("Acesso-teste-2026")).status).toBe(429);
  expect(m.update).not.toHaveBeenCalled();
});

it("reports failed storage without claiming the password was updated",async()=>{
  m.update.mockResolvedValue(null);
  expect((await setPassword("Acesso-teste-2026")).status).toBe(503);
  expect(m.invalidate).not.toHaveBeenCalled();
});
