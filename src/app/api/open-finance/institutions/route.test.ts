import {afterEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({scope:vi.fn(),banks:vi.fn()}));
vi.mock("@/lib/open-finance-http",()=>({openFinanceRequestScope:m.scope,OF_HEADERS:{"Cache-Control":"private, no-store"}}));
vi.mock("@/lib/open-finance-institutions",()=>({getBankInstitutions:m.banks}));
import {GET} from "./route";
afterEach(()=>vi.clearAllMocks());
it.each([['personal',['Inter PF','Both']],['business',['Inter PJ','Both']]])("keeps the full %s catalogue separated from the other platform",async(mode,names)=>{
  m.scope.mockResolvedValue({userId:"owner",mode,environment:"production"});
  m.banks.mockResolvedValue([{name:"Inter PF",type:"PERSONAL"},{name:"Inter PJ",type:"BUSINESS"},{name:"Both",type:"BOTH"}]);
  const r=await GET(new Request(`https://zelo.example/api/open-finance/institutions?mode=${mode}`));
  expect(r.status).toBe(200);expect((await r.json()).map((bank:{name:string})=>bank.name)).toEqual(names);
});
it("does not query the provider for an unauthorized caller",async()=>{
  m.scope.mockResolvedValue(new Response(null,{status:404}));
  expect((await GET(new Request("https://zelo.example/api/open-finance/institutions"))).status).toBe(404);
  expect(m.banks).not.toHaveBeenCalled();
});
