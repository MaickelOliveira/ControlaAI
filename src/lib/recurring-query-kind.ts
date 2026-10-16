import {normalizeBankText} from "./bank-question-parser";
export function recurringQueryKind(message:string):"recurring"|"installment"|null{
 const text=normalizeBankText(message);
 const installment=/\b(?:parcel\w*|prestacoes?|cuotas?)\b/.test(text);
 const recurring=/\b(?:recorrentes?|recurrentes?|assinaturas?|suscripciones?|suscripcion|mensualidades?)\b/.test(text);
 return installment&&!recurring?"installment":recurring&&!installment?"recurring":null;
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
