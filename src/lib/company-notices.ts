import "server-only";
import {multiCompanyEnabled,requireCompany} from "./companies";
/** Human-readable context also survives template rendering, where the free text is ignored. */
export async function companyNoticeDescription(userId:string,companyId:string|undefined,description:string):Promise<string|null>{
 if(!multiCompanyEnabled()||!companyId)return description;
 let company;try{company=await requireCompany(userId,companyId);}catch(error){if(error instanceof Error&&error.message==="COMPANY_NOT_FOUND")return null;throw error;}
 return `${company.name} · ${description}`;
}
export function companyAppointmentPhones(record:{companyId?:string;workspaceLegacy?:boolean},links:Array<{phone:string;access:"personal"|"business"|"both"}>):string[]{
 if(!multiCompanyEnabled()||record.workspaceLegacy!==false)return links.map(link=>link.phone);
 const mode=record.companyId?"business":"personal";
 return links.filter(link=>link.access===mode||link.access==="both").map(link=>link.phone);
}
