import {beforeEach,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
const m=vi.hoisted(()=>({auth:vi.fn(),scope:vi.fn(),bill:vi.fn(),answer:vi.fn()}));
vi.mock("@/lib/auth",()=>({getSessionWithUser:m.auth}));
vi.mock("@/lib/open-finance-http",()=>({openFinanceRequestScope:m.scope,OF_HEADERS:{"Cache-Control":"private, no-store"}}));
vi.mock("@/lib/open-finance-bills",()=>({prepareBankBill:m.bill}));
vi.mock("@/lib/open-finance-question",()=>({answerBankQuestion:m.answer}));
import {POST} from "./route";
const user={id:"own"},id="00000000-0000-4000-8000-000000000001";
const request=()=>new Request("https://zelo.example/api/open-finance/ask?mode=personal",{method:"POST",body:JSON.stringify({question:"envie a fatura do cartão",userId:"foreign"})});
beforeEach(()=>{vi.resetAllMocks();m.auth.mockResolvedValue({user});m.scope.mockResolvedValue({userId:"own",mode:"personal",environment:"production"});m.bill.mockResolvedValue({billId:id,text:"Demonstrativo da Zelo"});});
it("returns an authenticated download link for the selected own bill without making a PDF during the question",async()=>{
  const response=await POST(request()),result=await response.json();
  expect(result.downloadUrl).toBe(`/api/open-finance/bills/${id}?mode=personal`);expect(result.answer).toContain("Demonstrativo");expect(response.headers.get("cache-control")).toContain("no-store");
  expect(m.bill).toHaveBeenCalledWith(user,"personal","envie a fatura do cartão",expect.any(String),false);expect(m.answer).not.toHaveBeenCalled();
});
it("does not touch bill storage when the session is denied",async()=>{
  m.scope.mockResolvedValue(new Response(null,{status:401}));expect((await POST(request())).status).toBe(401);expect(m.bill).not.toHaveBeenCalled();
});
