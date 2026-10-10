import { NextResponse } from "next/server";
import { getSessionWithUser } from "@/lib/auth";
import { getOpenFinanceAccess } from "@/lib/open-finance-access";
import { getSupabase } from "@/lib/supabase";
import { isBankConnectReady } from "@/lib/open-finance-ready";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const auth = await getSessionWithUser();
  if (!auth || auth.session.role !== "client") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const scope = await getOpenFinanceAccess(auth.user, new URL(request.url).searchParams.get("mode"));
  if (!scope) return NextResponse.json({ error: "Não disponível" }, { status: 404 });
  try {
    const { data, error } = await getSupabase().rpc("zelo_of_overview", {
      p_user: scope.userId, p_environment: scope.environment, p_mode: scope.mode,
    });
    if (error || !data) throw new Error("STORAGE_UNAVAILABLE");
    const connectAvailable = await isBankConnectReady(scope);
    return NextResponse.json({ ...data, contactEmail: auth.user.email, connectAvailable }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Não foi possível consultar os bancos. Tente novamente." }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
