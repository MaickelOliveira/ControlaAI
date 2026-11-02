import {expect,it} from "vitest";
import {missingHistoricalLedgerNotice} from "./finance-history";
import type {BankFinancialData} from "./open-finance-report";
const bank={overview:{connections:[{}]},report:{from:"2025-10-01",to:"2025-10-31"}} as BankFinancialData;
it("distinguishes unavailable history from no spending on both statement surfaces",()=>{
 expect(missingHistoricalLedgerNotice(bank,0,"2026-11-02")).toContain("01/10/2025 a 31/10/2025");
 expect(missingHistoricalLedgerNotice(bank,0,"2026-11-02")).toContain("Isso não significa que você não gastou");
 expect(missingHistoricalLedgerNotice(bank,1,"2026-11-02")).toBeNull();
 expect(missingHistoricalLedgerNotice(null,0,"2026-11-02")).toBeNull();
 expect(missingHistoricalLedgerNotice({...bank,overview:{...bank.overview,connections:[]}},0,"2026-11-02")).toBeNull();
 expect(missingHistoricalLedgerNotice({...bank,report:{...bank.report,to:"2026-11-30"}},0,"2026-11-02")).toBeNull();
});
