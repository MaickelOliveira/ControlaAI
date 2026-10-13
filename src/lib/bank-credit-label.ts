const labels:Record<string,string>={CREDITO_A_VISTA:"Compras à vista",CREDITO_PARCELADO:"Compras parceladas",SAQUE_CREDITO_BRASIL:"Saques no Brasil",SAQUE_CREDITO_EXTERIOR:"Saques no exterior",OUTROS:"Outras modalidades"};
export function creditLineLabel(value:string|null|undefined):string {
  const name=value?.trim()||"Linha do cartão";
  return labels[name]??name;
}
export function creditConsolidationLabel(value:string|null|undefined):string {
  return value==="CONSOLIDADO"?"Limite compartilhado":value==="INDIVIDUAL"?"Limite individual":value?.trim()??"";
}
