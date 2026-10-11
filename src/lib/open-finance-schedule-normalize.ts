import "server-only";
import { createHash } from "node:crypto";
import { polpExternalId, polpObject, type PolpObject } from "./polp-production";
import { sourceDate } from "./open-finance-normalize";

function amount(value:unknown):string {
  if(typeof value!=="number"||!Number.isFinite(value)||Math.abs(value)>1e12)throw Error("INVALID_SCHEDULE_AMOUNT");
  return Math.abs(value).toFixed(2);
}
function optionalDate(value:unknown):string|null {
  if(value==null)return null;
  if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(value))throw Error("INVALID_DATE");
  const date=sourceDate(value);if(!date)throw Error("INVALID_DATE");return date;
}
function integer(value:unknown,min:number,max:number):number|null {
  if(value==null)return null;
  if(typeof value!=="number"||!Number.isInteger(value)||value<min||value>max)throw Error("INVALID_SCHEDULE");
  return value;
}

/** Provider-derived patterns, never payment confirmation or manual expenses. */
export function normalizeCardSchedules(kind:"recurrings"|"installments",rows:PolpObject[]):PolpObject[] {
  const keys=new Set<string>();
  return rows.map(row=>{
    if(typeof row.description!=="string"||!row.description.trim()||row.description.length>1000)throw Error("INVALID_SCHEDULE");
    if(!Array.isArray(row.occurrences)||!row.occurrences.length||row.occurrences.length>1000)throw Error("INVALID_SCHEDULE");
    const transactions=[...new Set(row.occurrences.map(polpExternalId))];
    if(kind==="recurrings"&&(typeof row.averageAmount!=="number"||row.averageAmount>=0||transactions.length<3))throw Error("INVALID_SCHEDULE");
    if(kind==="recurrings"&&(typeof row.currency!=="string"||!/^[A-Z]{3}$/.test(row.currency)))throw Error("INVALID_SCHEDULE");
    const value=amount(kind==="recurrings"?row.averageAmount:row.amount);
    const period=kind==="recurrings"?integer(row.periodMonths,1,12):null;
    const total=kind==="installments"?integer(row.totalInstallments,2,1000):null;
    const observed=kind==="installments"?integer(row.paidInstallments,1,total??1000):null;
    if(kind==="installments"&&(total==null||observed==null))throw Error("INVALID_SCHEDULE");
    const first=kind==="recurrings"?optionalDate(row.firstOccurrenceAt):null;
    const last=kind==="recurrings"?optionalDate(row.lastOccurrenceAt):null;
    const due=kind==="recurrings"?optionalDate(row.nextExpectedAt):null;
    if(due&&last&&due<=last)throw Error("INVALID_SCHEDULE");
    if(kind==="recurrings"&&(typeof row.regularityScore!=="number"||row.regularityScore<0||row.regularityScore>1))throw Error("INVALID_SCHEDULE");
    // The installments API does not provide currency or a next due date.
    const currency=kind==="recurrings"?"BRL":null;
    // Independent clusters may share merchant/date/amount. Observed transaction
    // identities distinguish them; SQL preserves identity as history changes.
    const key=createHash("sha256").update(JSON.stringify([kind,[...transactions].sort()])).digest("hex");
    if(keys.has(key))throw Error("DUPLICATE_SCHEDULE");keys.add(key);
    return {source_key:key,kind:kind==="recurrings"?"recurring":"installment",description:row.description.trim(),amount:value,currency,original_currency:kind==="recurrings"?row.currency:null,period_months:period,expected_day:kind==="recurrings"?integer(row.expectedDay,1,31):null,first_occurrence_date:first,last_occurrence_date:last,due_date:due,regularity_score:kind==="recurrings"?row.regularityScore:null,total_installments:total,observed_installments:observed,observed_transactions:transactions};
  });
}

export function normalizeBillPayments(row:PolpObject,currency:string|null):PolpObject {
  if(row.payments==null)return {payment_amount:null,payment_evidence:false};
  if(!Array.isArray(row.payments)||row.payments.length>500)throw Error("INVALID_BILL_PAYMENTS");
  let units=BigInt(0),found=false;
  for(const raw of row.payments){
    const payment=polpObject(raw);
    if(typeof payment.amount!=="string"||!/^\d{1,16}(\.\d{1,8})?$/.test(payment.amount)||typeof payment.currency!=="string"||!/^[A-Z]{3}$/.test(payment.currency))throw Error("INVALID_BILL_PAYMENTS");
    optionalDate(payment.paymentDate);
    if(payment.currency!==currency)continue;
    const [whole,fraction=""]=payment.amount.split(".");
    units+=BigInt(whole)*BigInt(100000000)+BigInt(fraction.padEnd(8,"0"));found=true;
  }
  return {payment_amount:found?`${units/BigInt(100000000)}.${(units%BigInt(100000000)).toString().padStart(8,"0")}`:null,payment_evidence:found};
}
