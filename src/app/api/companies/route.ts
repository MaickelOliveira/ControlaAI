import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionWithUser,invalidateUserAuthCache } from "@/lib/auth";
import { COMPANY_COOKIE, createCompany, getCompanies, multiCompanyEnabled, renameCompany, requireCompany, archiveCompany, restoreCompany } from "@/lib/companies";
import { companyCookieValue, selectedCompanyId } from "@/lib/company-selection";
import {isSameOrigin} from "@/lib/request-origin";
import {readBankBody} from "@/lib/open-finance-body";

const headers = { "Cache-Control": "private, no-store" };
async function authorized() {
  const auth = await getSessionWithUser();
  return auth?.session.role === "client" ? auth : null;
}
function validOrigin(request: Request): boolean {
  return isSameOrigin(request,process.env.OPEN_FINANCE_APP_ORIGIN||process.env.NEXT_PUBLIC_APP_URL);
}
async function selectCompany(userId: string, companyId: string) {
  (await cookies()).set(COMPANY_COOKIE, companyCookieValue(userId, companyId), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax",
    path: "/", maxAge: 60 * 60 * 24 * 7,
  });
}
export async function GET() {
  const auth = await authorized();
  if (!auth) return NextResponse.json({ error: "Não autorizado" }, { status: 401, headers });
  if (!multiCompanyEnabled()) return NextResponse.json({ enabled: false, companies: [] }, { headers });
  try {
    const all = await getCompanies(auth.user.id,true),companies=all.filter(c=>!c.archivedAt);
    const selected = selectedCompanyId(auth.user.id, (await cookies()).get(COMPANY_COOKIE)?.value);
    if(selected&&!all.some(c=>c.id===selected))throw Error("COMPANY_NOT_FOUND");
    const company = companies.find(item => item.id===selected)??companies.find(item=>item.isDefault)??companies[0];
    return NextResponse.json({ enabled: true, companies: companies.map(({ id, name }) => ({ id, name })), archivedCompanies:all.filter(c=>c.archivedAt).map(({id,name})=>({id,name})), activeCompanyId: company?.id??null }, { headers });
  } catch { return NextResponse.json({ error: "Não foi possível carregar as empresas." }, { status: 503, headers }); }
}
async function mutate(request: Request, operation: "create" | "select" | "rename" | "archive" | "restore") {
  const auth = await authorized();
  if (!auth) return NextResponse.json({ error: "Não autorizado" }, { status: 401, headers });
  if (!multiCompanyEnabled()) return NextResponse.json({ error: "Não disponível" }, { status: 404, headers });
  if (!validOrigin(request)) return NextResponse.json({ error: "Origem não autorizada" }, { status: 403, headers });
  let body: Record<string, unknown>;
  try { body = JSON.parse((await readBankBody(request,4096)).toString("utf8")); if (!body || Array.isArray(body) || typeof body !== "object") throw Error(); }
  catch { return NextResponse.json({ error: "Dados inválidos" }, { status: 400, headers }); }
  const create = operation === "create", rename = operation === "rename";
  if (((create || rename) && (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 100)) || (!create && typeof body.companyId !== "string")) {
    return NextResponse.json({ error: "Informe uma empresa válida." }, { status: 400, headers });
  }
  try {
    if(operation==="archive"){
      if(typeof body.confirmation!=="string"||body.confirmation.length>100)return NextResponse.json({error:"Confirme o nome exato da empresa."},{status:400,headers});
      const result=await archiveCompany(auth.user.id,body.companyId as string,body.confirmation);
      invalidateUserAuthCache(auth.user.id);
      const selected=selectedCompanyId(auth.user.id,(await cookies()).get(COMPANY_COOKIE)?.value);
      if(!selected||selected===body.companyId){if(result.activeCompanyId)await selectCompany(auth.user.id,result.activeCompanyId);else (await cookies()).set(COMPANY_COOKIE,"",{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",maxAge:0});}
      return NextResponse.json({ok:true,...result},{headers});
    }
    if(operation==="restore"){
      await restoreCompany(auth.user.id,body.companyId as string);
      return NextResponse.json({ok:true},{headers});
    }
    const company = create ? await createCompany(auth.user.id, body.name as string) : rename ? await renameCompany(auth.user.id, body.companyId as string, body.name as string) : await requireCompany(auth.user.id, body.companyId as string);
    if (!rename) await selectCompany(auth.user.id, company.id);
    return NextResponse.json({ ok: true, company: { id: company.id, name: company.name } }, { status: create ? 201 : 200, headers });
  } catch (failure) {
    if(operation==="archive"||operation==="restore")return NextResponse.json({error:failure instanceof Error&&failure.message==="COMPANY_CONFIRMATION"?"O nome mudou. Confira a empresa e confirme novamente.":"Não foi possível atualizar a empresa. Tente novamente."},{status:409,headers});
    const unavailable = create || (rename && failure instanceof Error && failure.message !== "COMPANY_NOT_FOUND");
    return NextResponse.json({ error: unavailable ? "Não foi possível salvar a empresa." : "Empresa não encontrada nesta conta." }, { status: unavailable ? 503 : 404, headers });
  }
}
export async function POST(request: Request) { return mutate(request, "create"); }
export async function PATCH(request: Request) { return mutate(request, "select"); }
export async function PUT(request: Request) { return mutate(request,new URL(request.url).searchParams.get("action")==="restore"?"restore":"rename"); }
export async function DELETE(request:Request){return mutate(request,"archive");}
