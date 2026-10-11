import "server-only";
import { NextResponse } from "next/server";
import { getSessionWithUser } from "./auth";
import { getOpenFinanceAccess, requireOpenFinanceOrigin } from "./open-finance-access";
import { getSupabase } from "./supabase";
import type { OpenFinanceScope } from "./open-finance-access";
export const OF_HEADERS = { "Cache-Control": "private, no-store" };
export async function openFinanceRequestScope(request: Request, mutation = false): Promise<OpenFinanceScope | Response> {
  const auth = await getSessionWithUser();
  if (!auth || auth.session.role !== "client") return NextResponse.json({ error: "Não autorizado" }, { status: 401, headers: OF_HEADERS });
  const scope = await getOpenFinanceAccess(auth.user, new URL(request.url).searchParams.get("mode"));
  if (!scope) return NextResponse.json({ error: "Não disponível" }, { status: 404, headers: OF_HEADERS });
  if (mutation) {
    try { requireOpenFinanceOrigin(request); }
    catch { return NextResponse.json({ error: "Origem não autorizada" }, { status: 403, headers: OF_HEADERS }); }
  }
  return scope;
}
export async function openFinanceRpc(scope: OpenFinanceScope, operation: string, params: Record<string, unknown> = {}): Promise<unknown> {
  let query=getSupabase().rpc(operation, { ...params, p_user: scope.userId, p_mode: scope.mode });
  if(process.env.MULTI_COMPANY_ENABLED==="true"){
    if(!scope.companyId)throw Error("OF_COMPANY_SCOPE_MISSING");
    query=query.setHeader("x-zelo-owner",scope.userId).setHeader("x-zelo-company",scope.companyId);
  }
  const { data, error } = await query;
  if (error) throw new Error("OF_STORAGE_ERROR");
  return data;
}
