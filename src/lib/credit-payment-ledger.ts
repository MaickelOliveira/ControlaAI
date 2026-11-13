import type {BankMovement} from "./open-finance-report";
import {ledgerAmount} from "./finance-ledger";
import {bankDebtCategory} from "./bank-debt";
import {normalizeMerchantText} from "./merchant-text";
import {isBankBillPayment} from "./bank-bill-payment";
// Provider loan-payment categories identify debits whose descriptions contain
// only an installment label or the customer's nickname for the loan.
const loanPaymentCategories=new Set([
 "LOAN_PAYMENTS","LOAN_PAYMENTS_CAR_PAYMENT","LOAN_PAYMENTS_CASH_ADVANCES",
 "LOAN_PAYMENTS_EWA","LOAN_PAYMENTS_MORTGAGE_PAYMENT","LOAN_PAYMENTS_PERSONAL_LOAN_PAYMENT",
 "LOAN_PAYMENTS_STUDENT_LOAN_PAYMENT","LOAN_PAYMENTS_OTHER_PAYMENT",
]);
function isExplicitLoanPayment(movement:BankMovement){
 const description=normalizeMerchantText(movement.description),category=movement.source_category;
 // Card bills and BNPL share the provider's LOAN_PAYMENTS family, but are not
 // evidence that this account debit repaid a loan/financing contract.
 if(category==="LOAN_PAYMENTS_CREDIT_CARD_PAYMENT"||category==="LOAN_PAYMENTS_BNPL"||/\b(?:iof|tarifa|encargos|juros)\b/.test(description))return false;
 return loanPaymentCategories.has(category??"")||/\b(?:liquidacao de parcela|pagamento de parcela|pagamento.*emprestimo|parcela.*financiamento)\b/.test(description);
}
/** Only a unique, explicitly identified loan payment identifies its account debit.
 * Arbitrary transfers, fees and same-value purchases never match by amount. */
export function mergeCreditPayments(movements:readonly BankMovement[],payments:readonly BankMovement[]):BankMovement[]{
 const result=movements.map(m=>({...m})),used=new Set<string>();
 const signature=(m:BankMovement)=>`${m.institution_id??m.institution_name}|${m.date}|${m.currency}|${ledgerAmount(m.amount)}`;
 for(const payment of payments){
  if(result.some(m=>m.id===payment.id))continue;
  const candidates=result.filter(m=>!used.has(m.id)&&m.resource_type==="account"&&m.direction==="debit"&&m.kind!=="excluded"&&signature(m)===signature(payment)&&!isBankBillPayment(m)&&isExplicitLoanPayment(m));
  const unique=payments.filter(p=>signature(p)===signature(payment)).length===1;
  if(candidates.length===1&&unique){
   const match=candidates[0];used.add(match.id);
   match.credit_resource_id=payment.resource_id;
   match.credit_category=bankDebtCategory({name:payment.resource_name});
  }else result.push(payment);
 }
 return result;
}
