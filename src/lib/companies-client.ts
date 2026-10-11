export type CompanyChoice={id:string;name:string};
export type CompanySnapshot={enabled:boolean;companies:CompanyChoice[];archivedCompanies?:CompanyChoice[];activeCompanyId:string|null};
let pending:Promise<CompanySnapshot>|undefined,until=0;
/** Share the header and empty-workspace check; never poll for company metadata. */
export function fetchCompanySnapshot():Promise<CompanySnapshot>{
 if(pending&&Date.now()<until)return pending;
 until=Date.now()+2000;
 pending=fetch("/api/companies",{cache:"no-store"}).then(async response=>{if(!response.ok)throw Error("COMPANIES_UNAVAILABLE");return response.json();}).catch(error=>{pending=undefined;throw error;});
 return pending;
}
