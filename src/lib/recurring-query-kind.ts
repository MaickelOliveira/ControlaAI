import {normalizeBankText} from "./bank-question-parser";
export function recurringQueryKind(message:string):"recurring"|"installment"|null{
 const text=normalizeBankText(message);
 const installment=/\b(?:parcel\w*|prestacoes?|cuotas?)\b/.test(text);
 const recurring=/\b(?:recorrentes?|recurrentes?|assinaturas?|suscripciones?|suscripcion|mensualidades?)\b/.test(text);
 return installment&&!recurring?"installment":recurring&&!installment?"recurring":null;
}

/** Cadastro feito na Zelo, sem pedir as estimativas recebidas dos bancos. */
export function isManualRecurringListRequest(message:string):boolean{
 const text=normalizeBankText(message);
 return recurringQueryKind(message)!==null
  && /\b(?:cadastrad[oa]s?|registrad[oa]s?|anotad[oa]s?|que\s+(?:eu\s+)?(?:cadastrei|registrei|anotei))\b/.test(text)
  && !/\b(?:banco|bancari[oa]s?|open finance|detectad[oa]s?|nao\s+cadastrad[oa]s?|sem\s+cadastro)\b/.test(text);
}

/** Consulta de comparação, não pedido para criar ou apagar uma assinatura. */
export function isUnregisteredBankRecurringRequest(message:string):boolean{
 const text=normalizeBankText(message);
 return /^(?:quais?|mostre|me mostre|liste|lista)\b/.test(text)
  && /\b(?:banco|bancarias?|open finance)\b/.test(text)
  && recurringQueryKind(message)==="recurring"
  && /\b(?:nao|sem)\s+(?:foram?\s+)?(?:cadastrad[oa]s?|registrad[oa]s?|anotad[oa]s?)\b/.test(text);
}

/** Valor recebido e regularidade não provam que uma cobrança futura terá esse valor. */
export function isUnreliableRecurringValueRequest(message:string):boolean{
 const text=normalizeBankText(message);
 return /^(?:quais?|mostre|me mostre|liste|lista)\b/.test(text)
  && recurringQueryKind(message)==="recurring"
  && /\b(?:valor(?:es)?|quantia|montante)\b/.test(text)
  && (/(?:\b(?:nao|sem|pouco)\s+(?:tem\s+)?(?:valor(?:es)?\s+)?(?:confiavel|confiaveis)\b)/.test(text)
   || /\bvalor(?:es)?\s+(?:nao|pouco)\s+(?:confiavel|confiaveis)\b/.test(text)
   || /\bvalor(?:es)?\s+(?:incertos?|desconhecidos?|nao informados?)\b/.test(text));
}

/** Pede montante futuro das parcelas, não uma relação de compras ou faturas. */
export function isRemainingKnownInstallmentsRequest(message:string):boolean{
 const text=normalizeBankText(message);
 return /\b(?:quanto|qual|calcule|some)\b/.test(text)
  && /\b(?:falta|faltam|resta|restam|restante|restantes|devo)\b/.test(text)
  && recurringQueryKind(message)==="installment"
  && /\b(?:total|valor|quantidade|numero)\s+(?:conhecid[oa]s?|informad[oa]s?)\b/.test(text);
}
