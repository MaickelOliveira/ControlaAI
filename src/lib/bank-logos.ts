import catalogue from "./bank-logo-catalogue.json";

/** Public image addresses only; never forward credentials or private network URLs. */
export function safeBankLogoUrl(value:unknown):string|null {
  if(typeof value!=="string"||value.length>2000)return null;
  try {
    const url=new URL(value),host=url.hostname.toLowerCase();
    if(url.protocol!=="https:"||url.username||url.password||url.port||url.search||url.hash)return null;
    if(!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(host)||host.endsWith(".local")||host.endsWith(".localhost")||host.endsWith(".internal"))return null;
    return url.href;
  }catch{return null;}
}
export function bankLogoUrl(institutionId?:string|null,providerUrl?:string|null):string|null {
  const fresh=safeBankLogoUrl(providerUrl);
  if(fresh)return fresh;
  const bank=institutionId?(catalogue as Record<string,{name:string;url:string}>)[institutionId.toLowerCase()]:undefined;
  return safeBankLogoUrl(bank?.url);
}
