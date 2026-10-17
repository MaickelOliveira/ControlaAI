import { expect, it, vi } from "vitest";
vi.mock("server-only",()=>({}));
import { normalizeCardSchedules } from "./open-finance-schedule-normalize";
import { collapseBankInstallmentFragments, collectBankAgenda, formatBankAgenda, formatUpcomingBankAgenda, visibleBankSchedules } from "./open-finance-schedules";

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
 expect(reply).toContain("Data da próxima parcela não enviada pelo banco");
 expect(reply).not.toContain("próximo vencimento: Não informado");
});

it("only presents bank items with a confirmed future due date as upcoming",()=>{
 const items=[
  {id:"old",kind:"installment" as const,description:"Oticas Fam",resource_name:"platinum",institution_name:"Nubank",due_date:null,amount:"116.66",currency:null,synced_at:"2026-10-11",observed_installments:1,total_installments:3},
  {id:"bill",kind:"bill" as const,description:"Fatura atual",resource_name:"Gold",institution_name:"Banco",due_date:"2026-10-20",amount:"250.00",currency:"BRL",synced_at:"2026-10-15"},
  {id:"past",kind:"bill" as const,description:"Fatura anterior",resource_name:"Gold",institution_name:"Banco",due_date:"2026-10-10",amount:"50.00",currency:"BRL",synced_at:"2026-10-15"},
 ];
 const reply=formatUpcomingBankAgenda(items,"2026-10-15");
 expect(reply).toContain("fatura com vencimento 20/10/2026");
 expect(reply).toContain("20/10/2026");
 expect(reply).not.toContain("Oticas Fam");
 expect(reply).not.toContain("10/10/2026");
 expect(reply).toContain("1 parcelamento sem data");
 expect(reply).not.toContain("próximo vencimento: Não informado");
});

it("does not treat repeated Zé Delivery purchases as a subscription",()=>{
 const purchase={id:"ze",kind:"recurring" as const,description:"Zé Delivery",resource_name:"platinum",institution_name:"Nubank",due_date:"2026-11-11",amount:"51.07",currency:"BRL",synced_at:"2026-10-15"};
 const realSubscription={...purchase,id:"netflix",description:"Netflix"};
 expect(visibleBankSchedules([purchase,realSubscription],"2026-10-15").map(item=>item.id)).toEqual(["netflix"]);
 expect(collectBankAgenda([purchase,realSubscription],{from:"2026-10-01",to:"2026-11-30"}).map(item=>item.id)).toEqual(["netflix"]);
});

it("keeps a finished old installment in history but not in current schedules",()=>{
 const old={id:"old",kind:"installment" as const,description:"Óticas Fam",resource_name:"platinum",institution_name:"Nubank",due_date:null,amount:"116.66",currency:null,synced_at:"2026-10-15",observed_installments:1,total_installments:3,last_observed_month:"2025-12-01",last_observed_installment:3};
 expect(visibleBankSchedules([old],"2026-10-15")).toEqual([]);
 expect(collectBankAgenda([old],{from:"2026-10-01",to:"2026-10-31",includeUndated:true})).toEqual([]);
 expect(collectBankAgenda([old],{from:"2025-12-01",to:"2025-12-31",includeUndated:true})).toEqual([old]);
});

it("shows one purchase when bank fragments cover complementary installments of the same purchase",()=>{
 const first={id:"first",resource_id:"card-1",kind:"installment" as const,description:"DM*HOSTINGER.COM.BR",resource_name:"Card",institution_name:"Bank",due_date:null,amount:"43.71",currency:null,synced_at:"2026-10-17",purchase_date:"2026-07-13",source_ordinals:[1,2,3],total_installments:12,observed_installments:3,last_observed_installment:3,last_observed_month:"2026-09-01"};
 const rest={...first,id:"rest",description:"DM*HOSTINGER.COM.",amount:"43.61",source_ordinals:[4,5,6,7,8,9,10,11,12],observed_installments:9,last_observed_installment:4,last_observed_month:"2026-10-01"};
 const merged=collapseBankInstallmentFragments([first,rest]);
 expect(merged).toHaveLength(1);
 expect(merged[0]).toMatchObject({observed_installments:4,last_observed_installment:4,total_installments:12,amount:"43.61",amount_varies:true,merged_source_count:2});
 expect(visibleBankSchedules(merged,"2026-10-17")).toHaveLength(1);
 expect(formatBankAgenda(merged)).toContain("valor das outras parcelas pode variar");
});

it("keeps separate purchases with different dates, overlapping numbers or substantially different values",()=>{
 const base={id:"a",resource_id:"card-1",kind:"installment" as const,description:"KIWIFY *AutoDark",resource_name:"Card",institution_name:"Bank",due_date:null,amount:"258.33",currency:null,synced_at:"2026-10-17",purchase_date:"2025-12-21",source_ordinals:[1,2,3,4,5,6,7,8,9,10],total_installments:12,observed_installments:10,last_observed_installment:10,last_observed_month:"2026-10-01"};
 const tail={...base,id:"b",description:"KIWIFY *Aut",amount:"258.24",source_ordinals:[11,12],observed_installments:2,last_observed_installment:null,last_observed_month:null};
 expect(collapseBankInstallmentFragments([base,tail])).toHaveLength(1);
 expect(collapseBankInstallmentFragments([base,{...tail,purchase_date:"2025-12-22"}])).toHaveLength(2);
 expect(collapseBankInstallmentFragments([base,{...tail,source_ordinals:[10,11]}])).toHaveLength(2);
 expect(collapseBankInstallmentFragments([base,{...tail,amount:"250.00"}])).toHaveLength(2);
 expect(collapseBankInstallmentFragments([base,{...tail,purchase_date:null}])).toHaveLength(2);
});
