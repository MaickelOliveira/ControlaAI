import {phoneVariants} from "./conversations";
import {isAccountHolderRelation} from "./wpp-link-identity";

type Owner={id:string;name:string};
type Participant={phone:string;userId:string;name?:string;relation?:string};
export function participantDisplayName(ownerName:string,person:Participant):string|undefined {
  return (isAccountHolderRelation(person.relation)?ownerName:person.name)?.trim()||undefined;
}

/** Resolve only identities already registered inside this account; never guess bank authors. */
export function identifyFinanceAuthors<T extends {source?:string;registeredBy?:string}>(records:readonly T[],owner:Owner,participants:readonly Participant[]):Array<T&{registeredByName?:string}> {
  const names=new Map<string,string>();
  for(const person of participants){
    if(person.userId!==owner.id)continue;
    const name=participantDisplayName(owner.name,person);
    if(name)for(const phone of phoneVariants(person.phone))if(!names.has(phone))names.set(phone,name);
  }
  return records.map(record=>{
    const author=record.registeredBy;
    const name=record.source==="bank"||!author?undefined:author===owner.id?owner.name.trim():
      /^[+\d\s().-]+$/.test(author)?phoneVariants(author).map(phone=>names.get(phone)).find(Boolean):undefined;
    return {...record,registeredByName:name||undefined};
  });
}
