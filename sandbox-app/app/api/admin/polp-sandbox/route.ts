import { NextRequest, NextResponse } from "next/server";
import { COOKIE, sameOrigin, validSession } from "../../../../access";
import { PolpSandboxError, createSandboxConsent, getSandboxSnapshot, listPolpInstitutions, listSandboxConsents, listSandboxTransactions } from "@/lib/polp-sandbox";
import { reconcilePolpSnapshot } from "@/lib/polp-reconciliation";

const json = (body: object, status = 200) => NextResponse.json(body, {status,headers:{"Cache-Control":"private, no-store"}});
function failed(error: unknown) {
  return error instanceof PolpSandboxError ? json({error:error.message},error.status) : json({error:"Falha na consulta de teste."},502);
}

export async function GET(request: NextRequest) {
  if (!validSession(request.cookies.get(COOKIE)?.value)) return json({error:"Não autorizado."},401);
  const p = request.nextUrl.searchParams;
  try {
    switch(p.get("action")) {
      case "institutions": return json(await listPolpInstitutions(p.get("cursor") || undefined));
      case "consents": return json(await listSandboxConsents(p.get("cursor") || undefined));
      case "transactions": return json(await listSandboxTransactions(p.get("accountId") || ""));
      case "snapshot": {
        const snapshot = await getSandboxSnapshot(p.get("consentId") || "");
        return json({...snapshot,reconciliation:reconcilePolpSnapshot(snapshot),comparedWithZelo:false,
          comparisonLabel:"Este ambiente não acessa lançamentos reais do Zelo. A conferência abaixo separa compras, pagamentos e estornos dos dados fictícios."});
      }
      default: return json({error:"Consulta inválida."},400);
    }
  } catch(error) { return failed(error); }
}

export async function POST(request: NextRequest) {
  if (!validSession(request.cookies.get(COOKIE)?.value)) return json({error:"Não autorizado."},401);
  if (!sameOrigin(request)) return json({error:"Origem inválida."},403);
  if (Number(request.headers.get("content-length")) > 2048) return json({error:"Requisição muito grande."},413);
  try {
    const text = await request.text();
    if (text.length > 2048) return json({error:"Requisição muito grande."},413);
    const body = JSON.parse(text);
    if (typeof body?.institutionId !== "string") return json({error:"Selecione um banco."},400);
    return json(await createSandboxConsent(body.institutionId),201);
  } catch(error) { return failed(error); }
}
