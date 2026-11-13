import "server-only";
import {BILL_PAYMENT_CATEGORY,canMarkBankBillPayment,isBankBillPayment} from "./bank-bill-payment";
import {matchingBankNames} from "./bank-question-answer";
import {normalizeBankText} from "./bank-question-parser";
import {ledgerAmount} from "./finance-ledger";
import {readBankReport} from "./finance-ledger-storage";
import type {OpenFinanceScope} from "./open-finance-access";
import {openFinanceRpc} from "./open-finance-http";
import {bankPeriod} from "./open-finance-report";

const uuid=/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i;

export function parseMarkBillPayment(message:string,today:string){
 const text=normalizeBankText(message);
 if(!/^(?:(?:rita|zelo)[ ,:]+)?(?:(?:por favor[, ]+|pode\s+)?(?:marque|marcar?|classifi(?:que|car|ca)|reclassifi(?:que|car|ca)|corrij[ae]|corrigir|tir[ea]r?|retir[ea]r?|exclua da soma))\b/.test(text)
  ||!/\b(?:pag(?:amento|to)\s+(?:(?:da|do|de)\s+)?(?:fatura|cartao)|como fatura)\b/.test(text))return null;
 const mode=/\b(?:empresa|empresarial|pj)\b/.test(text)?"business" as const:/\b(?:pessoal|pf)\b/.test(text)?"personal" as const:undefined;
 const both=/\b(?:empresa|empresarial|pj)\b/.test(text)&&/\b(?:pessoal|pf)\b/.test(text);
 const match=text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(20\d{2}))?\b/);
 const day=match?`${match[3]??today.slice(0,4)}-${match[2].padStart(2,"0")}-${match[1].padStart(2,"0")}`:
  /\bontem\b/.test(text)?new Date(Date.parse(today)-86400000).toISOString().slice(0,10):/\bhoje\b/.test(text)?today:null;
 const amountText=(match?text.replace(match[0]," "):text).replace(/\b(?:final|terminado em)\s+\d{4}\b/g," ");
 const values=[...amountText.matchAll(/\d+(?:[.,]\d+)*/g)];
 const value=values.length===1?values[0][0]:"";
 const amount=/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(value)?ledgerAmount(value.replace(/\./g,"").replace(",",".")):null;
 const bank=text.match(/\b(?:no|na|do|da)\s+(?:banco\s+)?([a-z][a-z0-9-]*(?:\s+(?:pago|pay|finance|bank))?)(?=\s|[?!.,;:]|$)/g)
  ?.map(value=>value.replace(/^(?:no|na|do|da)\s+(?:banco\s+)?/,""))
  .filter(value=>!/^(?:fatura|cartao|conta|mes|dia|empresa|pessoal|modo|soma|total|extrato|zelo)$/.test(value)).at(-1);
 return {day,amount,bank,mode,both};
}

export async function billPaymentCandidates(scope:OpenFinanceScope,day:string,amount:number,bank?:string){
 const period=bankPeriod(day,day);
 const report=await readBankReport(scope,period);
 const candidates=report.movements.filter(row=>uuid.test(row.id)&&row.date===day&&row.currency==="BRL"&&ledgerAmount(row.amount)===amount&&canMarkBankBillPayment(row));
 const names=bank?matchingBankNames(candidates.map(row=>row.institution_name),bank):null;
 return names?candidates.filter(row=>names.includes(row.institution_name)):candidates;
}

/** Keep the user's decision in the existing, owner-scoped movement metadata. */
export async function setBankBillPayment(scope:OpenFinanceScope,id:string,day:string,marked:boolean,expectedAmount?:number){
 if(!uuid.test(id))return false;
 const report=await readBankReport(scope,bankPeriod(day,day));
 const row=report.movements.find(movement=>movement.id===id&&movement.date===day);
 if(!row||!canMarkBankBillPayment(row)||expectedAmount!==undefined&&ledgerAmount(row.amount)!==expectedAmount)return false;
 if(marked&&isBankBillPayment(row))return true;
 if(marked&&row.kind==="excluded")return false;
 if(!marked&&row.user_category!==BILL_PAYMENT_CATEGORY)return false;
 return await openFinanceRpc(scope,"zelo_of_set_movement_category",{p_movement:id,p_category:marked?BILL_PAYMENT_CATEGORY:null})===true;
}
