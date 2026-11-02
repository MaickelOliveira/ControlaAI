import {expect,it} from "vitest";
import {getExplicitSpendingSummaryResult} from "./ai-processor";
const anchor=new Date(2026,10,2,12);
it.each([
 ["quanto já gastei esse mês","2026-11-01","2026-11-30"],
 ["quanto gastei mês passado","2026-10-01","2026-10-31"],
 ["quanto gastei em outubro do ano passado","2025-10-01","2025-10-31"],
 ["quanto gastei em setembro de 2025","2025-09-01","2025-09-30"],
])("keeps the exact requested spending month: %s",(text,from,to)=>expect(getExplicitSpendingSummaryResult(text,anchor)).toMatchObject({intent:"finance_query",period:{from,to},financeType:"expense"}));
it.each(["quanto gastei no Santander","quanto gastei com delivery esse mês","quanto gastei por categoria","registra compra de 50 reais"])("preserves specific bank, merchant, category and mutation handlers: %s",text=>expect(getExplicitSpendingSummaryResult(text,anchor)).toBeNull());
