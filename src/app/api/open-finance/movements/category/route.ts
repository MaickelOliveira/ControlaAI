import {NextResponse} from "next/server";
import {getSessionWithUser} from "@/lib/auth";
import {getOpenFinanceAccess,requireOpenFinanceOrigin} from "@/lib/open-finance-access";
import {openFinanceRpc,OF_HEADERS} from "@/lib/open-finance-http";
import {readBankBody} from "@/lib/open-finance-body";
import {CATEGORIES_EXPENSE,CATEGORIES_INCOME} from "@/lib/finances";
export async function PATCH(request:Request){
  const auth=await getSessionWithUser();
  if(!auth||auth.session.role!=="client")return NextResponse.json({error:"Não autorizado"},{status:401,headers:OF_HEADERS});
  const scope=await getOpenFinanceAccess(auth.user,new URL(request.url).searchParams.get("mode"));
  if(!scope)return NextResponse.json({error:"Não disponível"},{status:404,headers:OF_HEADERS});
  try{requireOpenFinanceOrigin(request);}catch{return NextResponse.json({error:"Origem não autorizada"},{status:403,headers:OF_HEADERS});}
  let movementId:string,category:string|null;
  try{
    const body=JSON.parse((await readBankBody(request,4096)).toString("utf8"));
    movementId=body.movementId;category=body.category;
    const categories=[...CATEGORIES_EXPENSE,...CATEGORIES_INCOME,...auth.user.customCategoriesExpense??[],...auth.user.customCategoriesIncome??[]];
    if(typeof movementId!=="string"||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(movementId)||category!==null&&(typeof category!=="string"||category.length>100||!categories.includes(category)))throw Error("INVALID_CATEGORY");
  }catch{return NextResponse.json({error:"Escolha uma categoria válida."},{status:400,headers:OF_HEADERS});}
  try{
    const saved=await openFinanceRpc(scope,"zelo_of_set_movement_category",{p_movement:movementId,p_category:category});
    if(saved!==true)return NextResponse.json({error:"Movimentação não encontrada neste modo."},{status:404,headers:OF_HEADERS});
    return NextResponse.json({ok:true},{headers:OF_HEADERS});
  }catch{return NextResponse.json({error:"Não foi possível salvar a categoria. Tente novamente."},{status:503,headers:OF_HEADERS});}
}
