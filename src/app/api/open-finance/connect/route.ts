import { NextResponse } from "next/server";
import { openFinanceRequestScope, openFinanceRpc, OF_HEADERS } from "@/lib/open-finance-http";
import { getBankInstitutions } from "@/lib/open-finance-institutions";
import { createProductionConsent, polpObject, polpUuid, requireAuthUrl, validateBankDocuments } from "@/lib/polp-production";
export async function POST(request: Request) {
  const scope = await openFinanceRequestScope(request, true);
  if (scope instanceof Response) return scope;
  if (process.env.OPEN_FINANCE_CONNECT_ENABLED !== "true") return NextResponse.json({ error: "A conexão ainda não está disponível." }, { status: 503, headers: OF_HEADERS });
  try {
    if (!request.headers.get("content-type")?.startsWith("application/json")) throw new Error("INVALID_INPUT");
    const raw = await request.text();
    if (raw.length > 4096) throw new Error("INVALID_INPUT");
    const input = polpObject(JSON.parse(raw));
    if (input.acceptedTerms !== true || input.journeyVersion !== "celcoin-2026-10") throw new Error("INVALID_TERMS");
    const institutionId = polpUuid(input.institutionId);
    const documents = validateBankDocuments(input.cpf, input.cnpj, scope.mode);
    const bank = (await getBankInstitutions()).find(item => item.id === institutionId);
    if (!bank || bank.status !== "OPERATIONAL" || bank.is_outage || (scope.mode === "personal" && bank.type === "BUSINESS") || (scope.mode === "business" && bank.type === "PERSONAL")) throw new Error("INVALID_INSTITUTION");
    const consent = await createProductionConsent(scope.userId, institutionId, documents);
    // Copy only fields needed to bind ownership. Never persist documents/URL/error payloads.
    const stored = polpObject(await openFinanceRpc(scope, "zelo_of_save_consent", { p_consent: {
      id: consent.id, cliente_user_id: scope.userId, institution_id: institutionId,
      institution_name: bank.name, status: consent.status, products: consent.products,
    } }));
    return NextResponse.json({ id: stored.id, authorizationUrl: consent.url_to_authenticate ? requireAuthUrl(consent.url_to_authenticate) : null }, { status: 201, headers: OF_HEADERS });
  } catch (error) {
    const invalid = error instanceof Error && /^(INVALID_(INPUT|TERMS|DOCUMENT|ID|INSTITUTION))$/.test(error.message);
    return NextResponse.json({ error: invalid ? "Confira o banco, os documentos e o aceite para continuar." : "Não foi possível iniciar a conexão. Tente novamente em instantes." }, { status: invalid ? 400 : 503, headers: OF_HEADERS });
  }
}
