import type {BankMovement} from "./open-finance-report";
import {ledgerAmount} from "./finance-ledger";
import {bankDebtCategory} from "./bank-debt";
import {normalizeMerchantText} from "./merchant-text";
/** Only a unique, explicitly described loan payment identifies its account debit.
 * Arbitrary transfers, fees and same-value purchases never match by amount. */
export function mergeCreditPayments(movements:readonly BankMovement[],payments:readonly BankMovement[]):BankMovement[]{
 const result=movements.map(m=>({...m})),used=new Set<string>();
 const signature=(m:BankMovement)=>`${m.institution_id??m.institution_name}|${m.date}|${m.currency}|${ledgerAmount(m.amount)}`;
 const explicit=(m:BankMovement)=>/\b(?:liquidacao de parcela|pagamento de parcela|pagamento.*emprestimo|parcela.*financiamento)\b/.test(normalizeMerchantText(m.description))&&!/\b(?:iof|tarifa|encargos|juros)\b/.test(normalizeMerchantText(m.description));
 for(const payment of payments){
  if(result.some(m=>m.id===payment.id))continue;
  const candidates=result.filter(m=>!used.has(m.id)&&m.resource_type==="account"&&m.direction==="debit"&&m.kind!=="excluded"&&signature(m)===signature(payment)&&explicit(m));
  const unique=payments.filter(p=>signature(p)===signature(payment)).length===1;
  if(candidates.length===1&&unique){
   const match=candidates[0];used.add(match.id);
   match.credit_resource_id=payment.resource_id;
   match.credit_category=bankDebtCategory({name:payment.resource_name});
  }else result.push(payment);
 }
 return result;
}
