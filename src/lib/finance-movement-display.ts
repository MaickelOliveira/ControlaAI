import type {LedgerEntry} from "./finance-ledger";
import {bankMoney} from "./open-finance-display";
import {creditPaymentAdjustment} from "./credit-funded-payment";

/** Movement direction is different from its contribution to spending:
 * a card credit reduces expenses and must still appear as a credit. */
export function financeMovementDisplay(entry:LedgerEntry){
  const bank=entry.bank;
  const direction=bank
    ? bank.direction==="credit"||bank.direction==="debit"?bank.direction:"unknown"
    : (entry.amount<0?entry.type==="expense":entry.type==="income")?"credit":"debit";
  const raw=bank?(creditPaymentAdjustment(bank)?.charges_amount??bank.amount):null;
  const amount=bank?bankMoney(raw?.replace(/^-/,"")??null,bank.currency)
    : Math.abs(entry.amount).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
  const sign=direction==="unknown"||bank&&raw===null?"":direction==="credit"?"+":"−";
  const note=bank?.resource_type==="card"&&direction==="credit"?"Crédito no cartão · não é receita":null;
  return {direction,amount,sign,note};
}
