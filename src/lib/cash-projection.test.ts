import {describe, expect, it} from "vitest";
import type {Finance} from "./finances";
import type {RecurringTransaction} from "./recurring";
import {cashProjection, projectionReply} from "./cash-projection";
import {financeConversation, explicitPaidCount, isFinanceScreenQuestion} from "./finance-conversation";
import {firstMonthlyDue, scheduledDates} from "./recurring-calendar";

const period = {from:"2026-12-01",to:"2026-12-31"}, today = "2026-11-22";
const rule = (id: string, type: "income"|"expense", amount: number, extra: Partial<RecurringTransaction>={}): RecurringTransaction =>
  ({id,userId:"fixture",type,amount,category:"Outros",description:id,mode:"personal",recurrenceType:"recurring",repeatUnit:"monthly",dayOfMonth:10,
    paidInstallments:0,startDate:"2026-11-10",nextDueDate:"2026-12-10",status:"active",source:"whatsapp",createdAt:today,...extra});
const entry = (extra:Partial<Finance>={}): Finance => ({id:"entry",userId:"fixture",type:"income",amount:900,category:"Outros",description:"Saldo anterior",date:"2026-10-01",mode:"personal",source:"web",createdAt:today,...extra});

describe("registered cash flow",()=>{
  it("includes opening history, intervening commitments, salary and expenses exactly once",()=>{
    const rules=[rule("salary","income",2200),rule("food","income",150),rule("rent","expense",800,{nextDueDate:"2026-11-10"}),
      rule("loan","expense",300,{mode:"business"}),rule("old","expense",42,{status:"cancelled"})];
    const rows=[entry(),entry({type:"expense",amount:80,date:"2026-11-25",status:"pending"}),entry({id:"salary-occ",date:"2026-12-10",amount:2200,status:"pending",recurringId:"salary"}),
      entry({type:"expense",amount:7.25,date:"2026-12-20",status:"pending"}),entry({type:"expense",amount:200,date:"2026-12-20",status:"pending",autoPost:false})];
    expect(cashProjection(rows,rules,"personal",period,today)).toMatchObject({opening:82000,income:235000,expense:80725,closing:236275,undated:1});
  });
  it("shows missing opening history, empty new accounts and suspected duplicates",()=>{
    const p=cashProjection([],[],"personal",period,today);
    expect(projectionReply(p,"personal",period)).toContain("Sem saldo realizado anterior");
    expect(projectionReply(p,"personal",period)).toContain("Não encontrei receitas");
    const repeated=cashProjection([],[rule("Receita","income",5),rule("Receita","income",5,{id:"other"})],"personal",period,today);
    expect(repeated.possibleRepeats.size).toBe(1);
  });
  it("stops after the remaining installments and clamps month ends",()=>{
    const input=rule("parcelas","expense",100,{nextDueDate:"2026-12-31",dayOfMonth:31,paidInstallments:4,totalInstallments:7});
    expect(scheduledDates(input,"2027-01-01","2027-05-31")).toEqual(["2027-01-31","2027-02-28"]);
    expect(firstMonthlyDue("2027-02-01",31)).toBe("2027-02-28");
    expect(scheduledDates({...input,repeatUnit:"weekly",nextDueDate:"2027-01-01"},"2027-01-01","2027-01-31")).toHaveLength(3);
    expect(scheduledDates({...input,repeatUnit:"daily",nextDueDate:"2027-01-01"},"2027-01-02","2027-01-31")).toHaveLength(2);
  });
  it("understands the question and the immediate handoff while preserving unrelated messages",()=>{
    for(const text of ["Quanto sobrará no mês de dezembro?","Qual meu saldo financeiro projetado para 31/12/2026?","Quero saldo inicial, despesas programadas e saldo final","Quanto sobrará no mês de dezembr9"]) expect(financeConversation(text,[])?.kind).toBe("projection");
    expect(financeConversation("Por favor",[{role:"assistant",content:"Vou pedir para a Rita fazer essa projeção para dezembro de 2026. Pode ser?"}])?.kind).toBe("projection");
    expect(financeConversation("Quanto sobrará?",[{role:"user",content:"Quais minhas despesas para dezembro?"}])?.prior).toContain("dezembro");
    expect(financeConversation("Por favor",[{role:"assistant",content:"Posso cancelar o compromisso?"}])).toBeNull();
    expect(financeConversation("Cadastre receitas recorrentes",[])).toBeNull();
    expect(financeConversation("Qual meu saldo atual?",[])).toBeNull();
    expect(isFinanceScreenQuestion("Kd a receita")).toBe(true);
    expect(isFinanceScreenQuestion("As receitas continuam zeradas no app")).toBe(true);
    expect(explicitPaidCount("já paguei 4 meses dele")).toBe(4);
    expect(explicitPaidCount("já foram pagas 4 parcelas")).toBe(4);
  });
});
