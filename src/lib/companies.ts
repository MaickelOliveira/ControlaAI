import "server-only";
import {getSupabase} from "./supabase";
import {selectCompanyContext} from "./company-selection";
export type Company={id:string;name:string;document?:string;isDefault:boolean;createdAt:string;archivedAt?:string;customCategoriesExpense:string[];customCategoriesIncome:string[]};
type CompanyRow={id:string;name:string;document:string|null;is_default:boolean;created_at:string;archived_at?:string|null;custom_categories_expense:string[];custom_categories_income:string[]};
export const multiCompanyEnabled=()=>process.env.MULTI_COMPANY_ENABLED==="true";
export const COMPANY_COOKIE="zelo_company";
function fromRow(row:CompanyRow):Company{return {id:row.id,name:row.name,document:row.document||undefined,isDefault:row.is_default,createdAt:row.created_at,...(row.archived_at?{archivedAt:row.archived_at}:{}),customCategoriesExpense:row.custom_categories_expense??[],customCategoriesIncome:row.custom_categories_income??[]};}
export async function getCompanies(userId:string,includeArchived=false):Promise<Company[]>{
 const {data,error}=await getSupabase().from("companies").select("*").eq("user_id",userId).order("created_at");
 if(error||!Array.isArray(data))throw Error("COMPANIES_UNAVAILABLE");return (data as CompanyRow[]).map(fromRow).filter(c=>includeArchived||!c.archivedAt);
}
export async function requireCompany(userId:string,id?:string):Promise<Company>{
 const list=await getCompanies(userId);const company=id?list.find(item=>item.id===id):list.find(item=>item.isDefault)??list[0];
 if(!company)throw Error("COMPANY_NOT_FOUND");return company;
}
export async function companyContextData(userId:string,id:string|undefined,mode:"personal"|"business"){
 const list=await getCompanies(userId,true);const company=selectCompanyContext(list,id,mode);
 return {company,archivedCompanyIds:list.filter(c=>c.archivedAt).map(c=>c.id)};
}
export async function archiveCompany(userId:string,companyId:string,confirmation:string):Promise<{activeCompanyId:string|null;mode:"personal"|"business";retiring:number}>{
 const {data,error}=await getSupabase().rpc("zelo_archive_company",{p_owner:userId,p_company:companyId,p_confirmation:confirmation});
 if(error||!data)throw Error(error?.message?.includes("COMPANY_CONFIRMATION")?"COMPANY_CONFIRMATION":"COMPANY_ARCHIVE_FAILED");
 return data;
}
export async function restoreCompany(userId:string,companyId:string):Promise<void>{
 const {error}=await getSupabase().rpc("zelo_restore_company",{p_owner:userId,p_company:companyId});
 if(error)throw Error("COMPANY_RESTORE_FAILED");
}
export async function createCompany(userId:string,name:string,document?:string):Promise<Company>{
 const normalized=name.trim();const cleaned=document?.replace(/\D/g,"");
 if(!normalized||normalized.length>100||(cleaned&&cleaned.length!==14))throw Error("COMPANY_INVALID");
 const {data,error}=await getSupabase().from("companies").insert({user_id:userId,name:normalized,document:cleaned||null}).select("*").single();
 if(error||!data)throw Error("COMPANY_CREATE_FAILED");return fromRow(data as CompanyRow);
}
export async function renameCompany(userId:string,companyId:string,name:string):Promise<Company>{
 const normalized=name.trim();
 if(!normalized||normalized.length>100)throw Error("COMPANY_INVALID");
 const {data,error}=await getSupabase().from("companies").update({name:normalized}).eq("id",companyId).eq("user_id",userId).is("archived_at",null).select("*").maybeSingle();
 if(error)throw Error("COMPANY_UPDATE_FAILED");
 if(!data)throw Error("COMPANY_NOT_FOUND");
 return fromRow(data as CompanyRow);
}
export async function updateCompanyCategories(userId:string,companyId:string,patch:{customCategoriesExpense?:string[];customCategoriesIncome?:string[]}):Promise<void>{
 const row:Record<string,string[]>={};if(patch.customCategoriesExpense)row.custom_categories_expense=patch.customCategoriesExpense;if(patch.customCategoriesIncome)row.custom_categories_income=patch.customCategoriesIncome;
 const {error}=await getSupabase().from("companies").update(row).eq("id",companyId).eq("user_id",userId);if(error)throw Error("COMPANY_UPDATE_FAILED");
}
