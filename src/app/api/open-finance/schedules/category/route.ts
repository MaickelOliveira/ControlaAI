import {NextResponse} from "next/server";
import {getSessionWithUser} from "@/lib/auth";
import {getOpenFinanceAccess,requireOpenFinanceOrigin} from "@/lib/open-finance-access";
import {openFinanceRpc,OF_HEADERS} from "@/lib/open-finance-http";
import {readBankBody} from "@/lib/open-finance-body";
import {workspaceCategoryUser} from "@/lib/workspace-categories";
import {CATEGORIES_EXPENSE} from "@/lib/finances";
import {runWithCompanyRequest} from "@/lib/company-context";
export async function PATCH(request:Request){
 return runWithCompanyRequest(async()=>{
  const auth=await getSessionWithUser();
  if(!auth||auth.session.role!=="client")return NextResponse.json({error:"Não autorizado"},{status:401,headers:OF_HEADERS});
  const scope=await getOpenFinanceAccess(auth.user,new URL(request.url).searchParams.get("mode"));
  if(!scope)return NextResponse.json({error:"Não disponível"},{status:404,headers:OF_HEADERS});
  try{requireOpenFinanceOrigin(request);}catch{return NextResponse.json({error:"Origem não autorizada"},{status:403,headers:OF_HEADERS});}
  let id:string,category:string|null;
  try{
   const body=JSON.parse((await readBankBody(request,4096)).toString("utf8"));id=body.scheduleId;category=body.category;
   if(typeof id!=="string"||!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)||category!==null&&(typeof category!=="string"||category.length>100))throw Error("INVALID_CATEGORY");
   const user=await workspaceCategoryUser(auth.user);
   if(category!==null&&![...CATEGORIES_EXPENSE,...user.customCategoriesExpense??[]].includes(category))throw Error("INVALID_CATEGORY");
  }catch{return NextResponse.json({error:"Escolha uma categoria válida."},{status:400,headers:OF_HEADERS});}
  try{
   const saved=await openFinanceRpc(scope,"zelo_of_set_schedule_category",{p_schedule:id,p_category:category});
   if(saved!==true)return NextResponse.json({error:"Cobrança não encontrada neste espaço."},{status:404,headers:OF_HEADERS});
   return NextResponse.json({ok:true},{headers:OF_HEADERS});
  }catch{return NextResponse.json({error:"Não foi possível salvar a categoria. Tente novamente."},{status:503,headers:OF_HEADERS});}
 });
}
