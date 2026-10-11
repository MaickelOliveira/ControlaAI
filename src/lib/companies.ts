import "server-only";
import {getSupabase} from "./supabase";
export type Company={id:string;name:string;document?:string;isDefault:boolean;createdAt:string;customCategoriesExpense:string[];customCategoriesIncome:string[]};
type CompanyRow={id:string;name:string;document:string|null;is_default:boolean;created_at:string;custom_categories_expense:string[];custom_categories_income:string[]};
export const multiCompanyEnabled=()=>process.env.MULTI_COMPANY_ENABLED==="true";
export const COMPANY_COOKIE="zelo_company";
function fromRow(row:CompanyRow):Company{return {id:row.id,name:row.name,document:row.document||undefined,isDefault:row.is_default,createdAt:row.created_at,customCategoriesExpense:row.custom_categories_expense??[],customCategoriesIncome:row.custom_categories_income??[]};}
export async function getCompanies(userId:string):Promise<Company[]>{
 const {data,error}=await getSupabase().from("companies").select("*").eq("user_id",userId).order("created_at");
 if(error||!Array.isArray(data))throw Error("COMPANIES_UNAVAILABLE");return (data as CompanyRow[]).map(fromRow);
}
export async function requireCompany(userId:string,id?:string):Promise<Company>{
 const list=await getCompanies(userId);const company=id?list.find(item=>item.id===id):list.find(item=>item.isDefault);
 if(!company)throw Error("COMPANY_NOT_FOUND");return company;
}
export async function createCompany(userId:string,name:string,document?:string):Promise<Company>{
 const normalized=name.trim();const cleaned=document?.replace(/\D/g,"");
 if(!normalized||normalized.length>100||(cleaned&&cleaned.length!==14))throw Error("COMPANY_INVALID");
 const {data,error}=await getSupabase().from("companies").insert({user_id:userId,name:normalized,document:cleaned||null}).select("*").single();
 if(error||!data)throw Error("COMPANY_CREATE_FAILED");return fromRow(data as CompanyRow);
}
export async function updateCompanyCategories(userId:string,companyId:string,patch:{customCategoriesExpense?:string[];customCategoriesIncome?:string[]}):Promise<void>{
 const row:Record<string,string[]>={};if(patch.customCategoriesExpense)row.custom_categories_expense=patch.customCategoriesExpense;if(patch.customCategoriesIncome)row.custom_categories_income=patch.customCategoriesIncome;
 const {error}=await getSupabase().from("companies").update(row).eq("id",companyId).eq("user_id",userId);if(error)throw Error("COMPANY_UPDATE_FAILED");
}
