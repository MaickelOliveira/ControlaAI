import {normalizeBankText} from "./bank-question-parser";
export function recurringQueryKind(message:string):"recurring"|"installment"|null{
 const text=normalizeBankText(message);
 const installment=/\b(?:parcel\w*|prestacoes?|cuotas?)\b/.test(text);
 const recurring=/\b(?:recorrentes?|recurrentes?|assinaturas?|suscripciones?|suscripcion|mensualidades?)\b/.test(text);
 return installment&&!recurring?"installment":recurring&&!installment?"recurring":null;
}
