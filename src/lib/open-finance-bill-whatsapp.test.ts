import {beforeEach,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
const m=vi.hoisted(()=>({prepare:vi.fn(),user:vi.fn(),phone:vi.fn(),scope:vi.fn(),file:vi.fn(),text:vi.fn()}));
vi.mock("./open-finance-bills",()=>({prepareBankBill:m.prepare}));
vi.mock("./users",()=>({getUserById:m.user,hasAccess:(u:{status:string})=>u.status==="active"}));
vi.mock("./wpp-phone-links",()=>({getPhoneAccess:m.phone}));
vi.mock("./open-finance-access",()=>({getOpenFinanceAccess:m.scope}));
vi.mock("./whatsapp",()=>({sendFile:m.file,sendText:m.text}));
import {sendRequestedBankBill} from "./open-finance-bill-whatsapp";
const user={id:"own",status:"active"} as Parameters<typeof sendRequestedBankBill>[0],phone="5511111111111";
const send=(message="me envie a fatura do cartão")=>sendRequestedBankBill(user,"personal",phone,message,"2026-10-11");
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv("OPEN_FINANCE_WHATSAPP_ENABLED","true");m.user.mockResolvedValue(user);m.phone.mockResolvedValue("personal");m.scope.mockResolvedValue({userId:"own",mode:"personal"});m.file.mockResolvedValue(true);m.prepare.mockResolvedValue({text:"Demonstrativo Zelo, não serve para pagamento",buffer:Buffer.from("%PDF"),filename:"demonstrativo.pdf"});});
it("sends only the requested own file and marks the financial message private",async()=>{
  expect(await send()).toBe(true);expect(m.file).toHaveBeenCalledWith(phone,expect.any(Buffer),"demonstrativo.pdf","application/pdf",expect.stringContaining("não serve para pagamento"),{privateFinancial:true});
});
it("asks which card is wanted instead of sending a guessed PDF",async()=>{
  m.prepare.mockResolvedValue({text:"Qual fatura você quer?"});await send();expect(m.file).not.toHaveBeenCalled();expect(m.text).toHaveBeenCalledWith(phone,"Qual fatura você quer?",{privateFinancial:true});
});
it("denies a different mode before reading a bill",async()=>{
  await send("envie a fatura da empresa");expect(m.prepare).not.toHaveBeenCalled();expect(m.file).not.toHaveBeenCalled();expect(m.text).toHaveBeenCalledWith(phone,expect.stringContaining("não tem acesso"),{privateFinancial:true});
});
it("revalidates the current binding before sending the prepared financial PDF",async()=>{
  m.prepare.mockImplementation(async()=>{m.phone.mockResolvedValue(null);return {buffer:Buffer.from("%PDF"),filename:"demo.pdf",text:"privado"};});
  await send();expect(m.file).not.toHaveBeenCalled();expect(m.text).not.toHaveBeenCalled();
});
it("does not retry a file automatically when delivery cannot be confirmed",async()=>{
  m.file.mockResolvedValue(false);await send();expect(m.file).toHaveBeenCalledTimes(1);expect(m.text).toHaveBeenCalledWith(phone,expect.stringContaining("Não consegui confirmar"),{privateFinancial:true});
});
