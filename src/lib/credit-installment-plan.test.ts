import {expect,it} from "vitest";
import {creditPlanDates,validCreditPlan} from "./credit-installment-plan";
const plan={resource_id:"car",amount:"890.10",currency:"BRL",first_due_date:"2024-01-31",last_due_date:"2024-05-31"};
it("keeps one monthly occurrence through the end, including leap months, without drifting after February",()=>{
 expect(creditPlanDates(plan,"2024-01-01","2024-12-31")).toEqual(["2024-01-31","2024-02-29","2024-03-31","2024-04-30","2024-05-31"]);
 expect(creditPlanDates(plan,"2024-03-01","2024-03-31")).toEqual(["2024-03-31"]);
 expect(creditPlanDates({...plan,last_due_date:"2024-05-30"},"2024-01-01","2024-12-31")).not.toContain("2024-05-31");
});
it("rejects invalid dates, negative or excessive precision, missing currency and unbounded schedules",()=>{
 for(const invalid of [{amount:"0"},{amount:"-20"},{amount:"10.001"},{currency:""},{first_due_date:"2024-02-30"},{last_due_date:"2023-12-31"},{last_due_date:"2074-01-31"}])expect(validCreditPlan({...plan,...invalid})).toBe(false);
 expect(validCreditPlan(plan)).toBe(true);
});
