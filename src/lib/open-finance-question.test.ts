import {describe,it,expect,vi,beforeEach} from "vitest";
vi.mock("server-only",()=>({}));
vi.mock("./open-finance-access",()=>({getOpenFinanceAccess:vi.fn()}));
vi.mock("./open-finance-http",()=>({openFinanceRpc:vi.fn()}));
import {getOpenFinanceAccess} from "./open-finance-access";
import {openFinanceRpc} from "./open-finance-http";
import {answerBankQuestion,parseBankQuestion} from "./open-finance-question";
const user={id:"owner",email:"owner@example.test",plan:"personal",activeMode:"personal"} as const;
describe("bank questions from saved data",()=>{
  beforeEach(()=>vi.clearAllMocks());
  it.each([
    ["zelo quanto eu tenho de emprestimo?", "loans", undefined],
    ["Quanto tenho de empréstimos em cada banco?", "loans", undefined],
    ["Quantos empréstimos eu tenho nos bancos conectados?", "loans", undefined],
    ["Mostre meus financiamentos", "financings", undefined],
    ["Quanto eu tenho de crédito disponível no cartão Nubank?", "limits", "nubank"],
    ["Qual meu limite disponível no Nubank?", "limits", "nubank"],
    ["Quanto já utilizei do limite do cartão Nubank?", "limits", "nubank"],
    ["Qual meu saldo no banco Sicredi?", "balances", "sicredi"],
    ["Mostre meus investimentos no Inter", "investments", "inter"],
    ["Qual o valor da fatura do cartão Nubank?", "bills", "nubank"],
  ])("recognizes the bank query %s before the generic expense classifier",(question,kind,bankName)=>{
    expect(parseBankQuestion(question,"2026-10-11")).toMatchObject({kind,...(bankName?{bankName}:{})});
  });
  it("recognizes last month's card query without treating registrations as questions",()=>{
    expect(parseBankQuestion("Quanto gastei nos cartões mês passado?","2026-10-09")).toEqual({kind:"spending",from:"2026-09-01",to:"2026-09-30",source:"card"});
    expect(parseBankQuestion("Registra 50 no cartão","2026-10-09")).toBeNull();
    expect(parseBankQuestion("Quanto gastei com iFood nos cartões?","2026-10-09")).toBeNull();
    expect(parseBankQuestion("Qual o saldo da empresa?","2026-10-09")).toBeNull();
    for(const question of ["Qual saldo dos bancos mês passado?","Quais faturas vencidas?","Qual meu limite hoje?","Como estavam meus investimentos mês passado?"])expect(parseBankQuestion(question,"2026-10-09")).toBeNull();
  });
  it("returns no bank answer for a hidden account",async()=>{
    vi.mocked(getOpenFinanceAccess).mockResolvedValue(null);
    expect(await answerBankQuestion(user,"personal","Qual meu limite disponível?","2026-10-09")).toBeNull();
    expect(openFinanceRpc).not.toHaveBeenCalled();
  });
  it("reads the database and preserves unknown credit limits",async()=>{
    vi.mocked(getOpenFinanceAccess).mockResolvedValue({userId:"owner",mode:"personal",environment:"production"});
    vi.mocked(openFinanceRpc).mockResolvedValue({connections:[{id:"c",institution_name:"Bank",status:"active"}],resources:[{id:"card",connection_id:"c",resource_type:"card",name:"Card"}],limits:[{resource_id:"card",line_name:"shared",currency:"BRL",total_amount:"5000",used_amount:"1000",available_amount:null}],sync:[],bills:[],credit:[]});
    const answer=await answerBankQuestion(user,"personal","Qual meu limite disponível?","2026-10-09");
    expect(answer).toContain("Disponível: Não informado");expect(answer).not.toContain("4.000");
    expect(openFinanceRpc).toHaveBeenCalledWith(expect.objectContaining({userId:"owner",mode:"personal"}),"zelo_of_overview",{p_environment:"production"});
  });
});
