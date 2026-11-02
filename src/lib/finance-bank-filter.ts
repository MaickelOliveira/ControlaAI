export function bankFilterValue(name:string):string {return `institution:${encodeURIComponent(name)}`;}
export function matchesBankFilter(name:string,resourceId:string|undefined,filter?:string):boolean {
  return !filter||filter===bankFilterValue(name)||filter===`bank:${resourceId}`;
}
export function bankFilterLabel(name:string):string {
  return name.replace(/^Banco Santander\s+Pessoa\s+(?:Física|Jurídica)$/i,"Santander").replace(/\s+(?:[–-]\s*)?(?:Pessoa\s+(?:Física|Jurídica)|PF|PJ)$/i,"").trim();
}
