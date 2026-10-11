import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionWithUser } from "@/lib/auth";
import { COMPANY_COOKIE, createCompany, getCompanies, multiCompanyEnabled, requireCompany } from "@/lib/companies";
import { companyCookieValue, selectedCompanyId } from "@/lib/company-selection";
import {isSameOrigin} from "@/lib/request-origin";

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
    const companies = await getCompanies(auth.user.id);
    const selected = selectedCompanyId(auth.user.id, (await cookies()).get(COMPANY_COOKIE)?.value);
    const company = companies.find(item => selected ? item.id === selected : item.isDefault);
    if (!company) throw Error("COMPANY_NOT_FOUND");
    return NextResponse.json({ enabled: true, companies: companies.map(({ id, name }) => ({ id, name })), activeCompanyId: company.id }, { headers });
  } catch { return NextResponse.json({ error: "Não foi possível carregar as empresas." }, { status: 503, headers }); }
}
async function mutate(request: Request, create: boolean) {
  const auth = await authorized();
  if (!auth) return NextResponse.json({ error: "Não autorizado" }, { status: 401, headers });
  if (!multiCompanyEnabled()) return NextResponse.json({ error: "Não disponível" }, { status: 404, headers });
  if (!validOrigin(request)) return NextResponse.json({ error: "Origem não autorizada" }, { status: 403, headers });
  let body: Record<string, unknown>;
  try { body = await request.json(); if (!body || Array.isArray(body) || typeof body !== "object") throw Error(); }
  catch { return NextResponse.json({ error: "Dados inválidos" }, { status: 400, headers }); }
  if (create ? typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 100 : typeof body.companyId !== "string") {
    return NextResponse.json({ error: "Informe uma empresa válida." }, { status: 400, headers });
  }
  try {
    const company = create ? await createCompany(auth.user.id, body.name as string) : await requireCompany(auth.user.id, body.companyId as string);
    await selectCompany(auth.user.id, company.id);
    return NextResponse.json({ ok: true, company: { id: company.id, name: company.name } }, { status: create ? 201 : 200, headers });
  } catch {
    return NextResponse.json({ error: create ? "Não foi possível cadastrar a empresa." : "Empresa não encontrada nesta conta." }, { status: create ? 503 : 404, headers });
  }
}
export async function POST(request: Request) { return mutate(request, true); }
export async function PATCH(request: Request) { return mutate(request, false); }
