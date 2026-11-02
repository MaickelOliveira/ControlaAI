import {expect,it} from "vitest";
import {installmentEndMonth,recurringInstallmentEnd} from "./installment-progress";
it("projects the last card competence from a numbered charge without claiming how many were paid",()=>{
 expect(installmentEndMonth("2026-11",2,5)).toBe("02/2027");
 expect(installmentEndMonth("2026-11-01",5,5)).toBe("11/2026");
 expect(installmentEndMonth(null,2,5)).toBeNull();expect(installmentEndMonth("2026-11",6,5)).toBeNull();
});
it("finds the final manual due date from confirmed paid count and the next unpaid installment",()=>{
 expect(recurringInstallmentEnd({nextDueDate:"2026-11-30",paidInstallments:8,totalInstallments:12,repeatUnit:"monthly",dayOfMonth:30})).toBe("2027-02-28");
 expect(recurringInstallmentEnd({nextDueDate:"2026-12-29",paidInstallments:1,totalInstallments:3,repeatUnit:"weekly"})).toBe("2027-01-05");
 expect(recurringInstallmentEnd({nextDueDate:"2026-11-30",paidInstallments:12,totalInstallments:12,repeatUnit:"monthly"})).toBeNull();
 expect(recurringInstallmentEnd({nextDueDate:"2026-02-30",paidInstallments:0,totalInstallments:2,repeatUnit:"monthly"})).toBeNull();
});
