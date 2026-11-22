import {expect,it} from "vitest";
import {generalExpensePeriod} from "./ai-processor";
import {importDates,importDecision} from "./import-date";
import {navigationTopic,panelReply} from "./panel-guidance";
import {explicitPaidCount} from "./finance-conversation";
import {getMissingActionQuestion} from "./action-completion";

const today=new Date("2026-11-22T12:00:00");
const items=[{description:"Pizza",date:"2025-12-10"},{description:"Transporte", date:"2026-11-16"}];

it("applies a requested month to each line, then honors a common due date in the approval",()=>{
  expect(importDates(items,"Crie essas despesas para dezembro de 2026",today)?.items?.map(i=>i.date)).toEqual(["2026-12-10","2026-12-16"]);
  const change="Sim. Todas para o dia 10/12/2026";
  expect(importDecision(change)).toBe("date");
  expect(importDates(items,change,today)?.items?.map(i=>i.date)).toEqual(["2026-12-10","2026-12-10"]);
  expect(importDates(items,"todas para o dia 31/02/2026",today)).toEqual({invalid:true});
  expect(importDecision("Sim, exceto o transporte")).toBe("clarify");
  expect(importDecision("Cancelar")).toBe("cancel");
});
it("keeps an undated-month request in the upcoming December and preserves a single day",()=>{
  expect(generalExpensePeriod("Quais minhas despesas de dezembro?",today)?.period).toEqual({from:"2026-12-01",to:"2026-12-31"});
  expect(generalExpensePeriod("Quais minhas despesas do dia 10/12/2026?",today)?.period).toEqual({from:"2026-12-10",to:"2026-12-10"});
  expect(generalExpensePeriod("quanto gastei em dezembro?",today)).toBeNull();
});
it("answers a screenshot or an objection in the context of the last navigation question",()=>{
  const history=[{role:"user",content:"Onde fica a opção contas a pagar?"},{role:"assistant",content:"Procure suas despesas no menu principal."}];
  expect(navigationTopic("?",history)).toBe("payables");
  expect(navigationTopic("Não achei essa opção",history)).toBe("payables");
  expect(navigationTopic("onde gastei mais?",history)).toBeNull();
  expect(navigationTopic("?",[])).toBeNull();
  expect(panelReply("payables")).toMatch(/Finanças.*Despesas do período.*A pagar/);
});
it("accepts an explicit installment count and a rename without asking for the same field again",()=>{
  expect(explicitPaidCount("Já paguei 4x meses")).toBe(4);
  expect(getMissingActionQuestion({intent:"recurring_edit",confidence:1,keyword:"Cama",newDescription:"Geladeira"})).toBeNull();
});
