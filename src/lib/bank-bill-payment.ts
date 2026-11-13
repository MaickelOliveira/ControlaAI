import type {BankMovement} from "./open-finance-report";

export const BILL_PAYMENT_CATEGORY="Pagamento de fatura";

/** A settlement needs a payment verb and an explicit card/bill descriptor. */
export function isBankBillPaymentDescription(description: string): boolean {
  const text = description.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if(/\b(?:juros|iof|tarifas?|multas?|anuidades?|seguro|parcelamento|encargos)\b/.test(text))return false;
  const subject=text.replace(/^(?:a\d+ )?(?:pix )?(?:(?:pagamento|pagto|pag|pgto)(?: efetuado)?|liquidacao|quitacao|deb(?:ito)? aut(?:om(?:atico)?)?) (?:da |do |de )?/,"");
  if(subject===text)return false;
  return /^fat(?:ura)?(?:$| (?:do |de )?(?:cartao|cart|master(?: ?card)?|visa|elo|amex|american express|hipercard|pix|em c c|final \d{4})\b)/.test(subject)
    || /^(?:cartao|cart) (?:de )?(?:credito|cred|master(?: ?card)?|visa|elo|amex|american express|hipercard)\b/.test(subject)
    || /^(?:fat(?:ura)? )?(?:parcial|minim[oa]|total) (?:da |de )?fat(?:ura)? (?:do |de )?cartao\b/.test(subject)
    || /^fat(?:ura)? (?:parcial|minim[oa]|total) (?:do |de )?cartao\b/.test(subject);
}

export function hasBankBillPaymentEvidence(type:string|null|undefined,category:string|null|undefined,description:string):boolean {
  return type==="PAGAMENTO_FATURA"||category==="CREDIT_CARD_PAYMENT"||category==="LOAN_PAYMENTS_CREDIT_CARD_PAYMENT"||isBankBillPaymentDescription(description);
}

/** Manual overrides apply only to a settlement side, never to a card purchase. */
export function canMarkBankBillPayment(movement:BankMovement):boolean {
  return !movement.credit_reconciliation&&!movement.credit_resource_id
    && (movement.resource_type==="account"&&movement.direction==="debit"||movement.resource_type==="card"&&movement.direction==="credit");
}

export function isBankBillPayment(movement:BankMovement,description=movement.description):boolean {
  if(movement.resource_type!=="account"&&movement.resource_type!=="card")return false;
  return movement.classification==="bill_payment"||hasBankBillPaymentEvidence(movement.source_type,movement.source_category,description??"")
    || movement.user_category===BILL_PAYMENT_CATEGORY&&canMarkBankBillPayment(movement);
}
