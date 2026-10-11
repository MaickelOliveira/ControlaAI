import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({session:vi.fn(),remove:vi.fn()}));
vi.mock("@/lib/auth",()=>({getAdminSession:m.session}));
vi.mock("@/lib/users",()=>({getUserById:vi.fn(),updateUser:vi.fn(),deleteUser:m.remove,activateUser:vi.fn(),deactivateUser:vi.fn()}));
import {DELETE} from "./route";
import {NextRequest} from "next/server";
const remove=()=>DELETE(new NextRequest("https://zelo.example/api/admin/clientes/client",{method:"DELETE"}),{params:Promise.resolve({id:"client"})});
beforeEach(()=>{vi.resetAllMocks();m.session.mockResolvedValue({role:"admin"});});
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
