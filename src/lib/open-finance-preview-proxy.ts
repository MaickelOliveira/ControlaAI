import {NextRequest,NextResponse} from "next/server";
import {previewRoutePolicy,previewSessionOwner} from "./open-finance-preview";
import {requireOpenFinanceOrigin} from "./open-finance-access";
export async function openFinancePreviewProxy(request:NextRequest) {
  const {pathname}=request.nextUrl,policy=previewRoutePolicy(pathname,request.method);
  const headers={"Cache-Control":"private, no-store","X-Robots-Tag":"noindex, nofollow, noarchive"};
  const deny=()=>NextResponse.json({error:"Não disponível nesta prévia privada."},{status:404,headers});
  if(policy==="deny")return deny();
  if(policy==="redirect")return NextResponse.redirect(new URL(pathname==="/"?"/login":"/dashboard/contas",request.url));
  if(policy==="login"){
    try{requireOpenFinanceOrigin(request);}catch{return deny();}
    return NextResponse.rewrite(new URL("/api/open-finance/login",request.url),{headers});
  }
  if(policy==="owner"){
    const user=await previewSessionOwner(request.cookies.get("ca_session")?.value);
    if(!user)return pathname.startsWith("/dashboard/")?NextResponse.redirect(new URL("/login",request.url)):deny();
    const mode=request.nextUrl.searchParams.get("mode");
    if(mode&&mode!=="personal"&&mode!=="business"||mode==="business"&&user.plan!=="business")return deny();
    if(request.method!=="GET")try{requireOpenFinanceOrigin(request);}catch{return deny();}
  }
  return NextResponse.next({headers});
}
