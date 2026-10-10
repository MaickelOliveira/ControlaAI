import { NextResponse } from "next/server";
import { openFinanceRequestScope, OF_HEADERS } from "@/lib/open-finance-http";
import { getBankInstitutions } from "@/lib/open-finance-institutions";
export async function GET(request: Request) {
  const scope = await openFinanceRequestScope(request);
  if (scope instanceof Response) return scope;
  try {
    const banks = (await getBankInstitutions()).filter(b => scope.mode === "personal" ? b.type !== "BUSINESS" : b.type !== "PERSONAL");
    return NextResponse.json(banks, { headers: OF_HEADERS });
  } catch { return NextResponse.json({ error: "Não foi possível listar os bancos." }, { status: 503, headers: OF_HEADERS }); }
}
