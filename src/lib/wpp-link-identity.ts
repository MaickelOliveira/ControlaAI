export type LinkIdentity={step:"name"|"relation"|"access";name?:string;relation?:string};
export function isAccountHolderRelation(relation?:string):boolean {
  return /^(?:titular|eu|eu mesmo|eu mesma|proprio|propria|dono|dona|yo|yo mismo|yo misma)$/.test((relation??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().toLowerCase());
}
export function initialLinkIdentity(registeredName:string,linkedCount:number):LinkIdentity {
  return linkedCount===0&&registeredName.trim() ? {step:"access",name:registeredName.trim(),relation:"Titular"} : {step:"relation"};
}
export function nextLinkRelation(pending:LinkIdentity,registeredName:string,answer:string):LinkIdentity {
  const relation=answer.trim().slice(0,30);const label=relation.charAt(0).toUpperCase()+relation.slice(1);
  if(pending.name)return {step:"access",name:pending.name,relation:label};
  if(isAccountHolderRelation(relation))return {step:"access",name:registeredName.trim(),relation:"Titular"};
  return {step:"name",relation:label};
}
