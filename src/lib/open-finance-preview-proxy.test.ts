import {afterEach,expect,it,vi} from "vitest";
import {NextRequest} from "next/server";
vi.mock("server-only",()=>({}));
const owner=vi.hoisted(()=>({id:"owner",email:"owner@example.test",plan:"personal"}));
vi.mock("./open-finance-preview",async original=>({...await original<typeof import("./open-finance-preview")>(),previewSessionOwner:vi.fn(async()=>owner)}));
import {openFinancePreviewProxy} from "./open-finance-preview-proxy";
afterEach(()=>vi.unstubAllEnvs());
it("permits only the explicitly enabled owner's PJ preview and still denies profile writes",async()=>{
  vi.stubEnv("OPEN_FINANCE_OWNER_EMAIL",owner.email);vi.stubEnv("OPEN_FINANCE_PREVIEW_ONLY","true");
  const request=()=>new NextRequest("https://zelo.example/api/open-finance?mode=business");
  vi.stubEnv("OPEN_FINANCE_PREVIEW_BUSINESS_ENABLED","");
  expect((await openFinancePreviewProxy(request())).status).toBe(404);
  vi.stubEnv("OPEN_FINANCE_PREVIEW_BUSINESS_ENABLED","true");
  expect((await openFinancePreviewProxy(request())).headers.get("x-middleware-next")).toBe("1");
  expect((await openFinancePreviewProxy(new NextRequest("https://zelo.example/api/admin/user-mode",{method:"PATCH"}))).status).toBe(404);
  expect(owner.plan).toBe("personal");
});
