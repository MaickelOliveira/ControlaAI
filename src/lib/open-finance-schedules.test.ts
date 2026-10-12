import { expect, it, vi } from "vitest";
vi.mock("server-only",()=>({}));
import { normalizeCardSchedules } from "./open-finance-schedule-normalize";
import { collectBankAgenda, formatBankAgenda } from "./open-finance-schedules";

it("treats a detected subscription as a BRL estimate, preserving its original currency and observed transactions",()=>{
  const [item]=normalizeCardSchedules("recurrings",[{description:"Streaming",averageAmount:-39.90,currency:"USD",periodMonths:1,expectedDay:9,firstOccurrenceAt:"2026-07-09",lastOccurrenceAt:"2026-09-09",nextExpectedAt:"2026-10-09",occurrences:["tx-1","tx-2","tx-3"],regularityScore:0.95}]);
  expect(item).toMatchObject({kind:"recurring",amount:"39.90",currency:"BRL",original_currency:"USD",due_date:"2026-10-09",last_occurrence_date:"2026-09-09",observed_transactions:["tx-1","tx-2","tx-3"]});
  expect(item).not.toHaveProperty("paid");
});
it("keeps an observed installment count without inventing its next due date or calling it paid",()=>{
  const [item]=normalizeCardSchedules("installments",[{description:"Loja",amount:150,totalInstallments:12,paidInstallments:3,occurrences:["tx-3"]}]);
  expect(item).toMatchObject({kind:"installment",amount:"150.00",currency:null,due_date:null,total_installments:12,observed_installments:3});
});
it("rejects invalid calendar dates, positive credits and missing occurrence identities",()=>{
  const base={description:"Streaming",averageAmount:-39.9,currency:"BRL",periodMonths:1,occurrences:["a","b","c"],regularityScore:0.95};
  expect(()=>normalizeCardSchedules("recurrings",[{...base,nextExpectedAt:"2026-02-30"}])).toThrow();
  expect(()=>normalizeCardSchedules("recurrings",[{...base,averageAmount:39.9}])).toThrow();
  expect(()=>normalizeCardSchedules("recurrings",[{...base,occurrences:[]}])).toThrow();
});
it("labels an overdue bank due date as informational, never as a confirmed unpaid expense",()=>{
  const item={id:"bill-1",kind:"bill" as const,description:"Fatura",resource_name:"Cartão",institution_name:"Banco",due_date:"2026-10-09",amount:"100.00",currency:"BRL",payment_evidence:false,synced_at:"2026-10-10T10:00:00Z"};
  const reply=formatBankAgenda(collectBankAgenda([item],{from:"2026-10-01",to:"2026-10-31",includeUndated:true}));
  expect(reply).toContain("pagamento não confirmado");expect(reply).not.toContain("atrasada");expect(reply).not.toContain("Total a pagar");
});
it("keeps a due-date notice even if reported payments cover the total, because they may belong to another cycle",()=>{
  const item={id:"paid",kind:"bill" as const,description:"Fatura",resource_name:"Cartão",institution_name:"Banco",due_date:"2026-10-10",amount:"100.00",currency:"BRL",payment_evidence:true,payment_amount:"100.00",synced_at:"2026-10-10T10:00:00Z"};
  expect(collectBankAgenda([item],{from:"2026-10-10",to:"2026-10-10",forNotification:true,now:"2026-10-10T12:00:00Z"})).toEqual([item]);
});
it("keeps a subscription identity when its estimated amount changes",()=>{
  const source={description:"Streaming",averageAmount:-39.9,currency:"BRL",periodMonths:1,firstOccurrenceAt:"2026-07-09",occurrences:["a","b","c"],regularityScore:0.95};
  expect(normalizeCardSchedules("recurrings",[source])[0].source_key).toBe(normalizeCardSchedules("recurrings",[{...source,averageAmount:-44.9}])[0].source_key);
});
it("preserves distinct subscription clusters for the same merchant that started on the same date",()=>{
  const source={description:"Streaming",averageAmount:-39.9,currency:"BRL",periodMonths:1,firstOccurrenceAt:"2026-07-09",occurrences:["a","b","c"],regularityScore:0.95};
  const items=normalizeCardSchedules("recurrings",[source,{...source,averageAmount:-59.9,occurrences:["x","y","z"]}]);
  expect(items).toHaveLength(2);expect(items[0].source_key).not.toBe(items[1].source_key);
});
it("does not notify stale estimates, but keeps incomplete bank data distinguishable from an empty agenda",()=>{
  const item={id:"s",kind:"recurring" as const,description:"Assinatura",resource_name:"Cartão",institution_name:"Banco",due_date:"2026-10-10",amount:"40",currency:"BRL",synced_at:"2026-10-01T10:00:00Z"};
  expect(collectBankAgenda([item],{from:"2026-10-10",to:"2026-10-10",forNotification:true,now:"2026-10-10T12:00:00Z"})).toEqual([]);
  expect(formatBankAgenda([],true)).toContain("incompleta");
});

it("formats bank forecasts in separate readable blocks and trims meaningless decimal zeros without assuming a currency",()=>{
 const reply=formatBankAgenda([{id:"p",kind:"installment",description:"Compra teste",resource_name:"Gold",institution_name:"Banco teste",due_date:null,amount:"74.79000000",currency:null,synced_at:"2026-10-11",observed_installments:2,total_installments:10}]);
 expect(reply).toContain("\n\n*1. Compra teste*\n");expect(reply).toContain("74,79 (moeda não informada)");expect(reply).not.toContain("74.79000000");expect(reply).not.toContain("R$");
});
