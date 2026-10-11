import { NextResponse } from "next/server";
import { openFinanceRequestScope, openFinanceRpc, OF_HEADERS } from "@/lib/open-finance-http";
import { getBankInstitutions } from "@/lib/open-finance-institutions";
import { createProductionConsent, polpObject, polpUuid, validateBankDocuments } from "@/lib/polp-production";
import { getConsentAuthorization } from "@/lib/open-finance-consent";
import { isBankConnectReady } from "@/lib/open-finance-ready";
import { enqueueConsentCheck } from "@/lib/open-finance-sync";
import { readBankBody } from "@/lib/open-finance-body";
import {getSupabase} from "@/lib/supabase";
import {revokeProductionConsent} from "@/lib/open-finance-revocation";
export async function POST(request: Request) {
  const scope = await openFinanceRequestScope(request, true);
  if (scope instanceof Response) return scope;
  if (!await isBankConnectReady(scope)) return NextResponse.json({ error: "A conexão ainda não está disponível." }, { status: 503, headers: OF_HEADERS });
  let cleanup:Record<string,unknown>|undefined;
  try {
    if (!request.headers.get("content-type")?.startsWith("application/json")) throw new Error("INVALID_INPUT");
    let input;
    try { input=polpObject(JSON.parse((await readBankBody(request,4096)).toString("utf8"))); } catch { throw new Error("INVALID_INPUT"); }
    if (input.acceptedTerms !== true || input.journeyVersion !== "celcoin-2026-10") throw new Error("INVALID_TERMS");
    const institutionId = polpUuid(input.institutionId);
    const documents = validateBankDocuments(input.cpf, input.cnpj, scope.mode);
    const bank = (await getBankInstitutions()).find(item => item.id === institutionId);
    if (!bank || bank.status !== "OPERATIONAL" || bank.is_outage || (scope.mode === "personal" && bank.type === "BUSINESS") || (scope.mode === "business" && bank.type === "PERSONAL")) throw new Error("INVALID_INSTITUTION");
    const consent = await createProductionConsent(scope.userId, institutionId, documents);
    cleanup={id:consent.id,cliente_user_id:scope.userId,institution_id:institutionId,institution_name:bank.name,products:consent.products};
    // Copy only fields needed to bind ownership. Never persist documents/URL/error payloads.
    const stored = polpObject(await openFinanceRpc(scope, "zelo_of_save_consent", { p_consent: {
      id: consent.id, cliente_user_id: scope.userId, institution_id: institutionId,
      institution_name: bank.name, status: consent.status, products: consent.products,
    } }));
    cleanup=undefined;
    await enqueueConsentCheck(scope,polpUuid(stored.id));
    const current = polpObject(await openFinanceRpc(scope, "zelo_of_connection", { p_id: stored.id }));
    const authorization = current.status === "pending" && consent.status === "AWAITING_AUTHORIZATION" ? getConsentAuthorization(consent) : { authorizationUrl: null };
    return NextResponse.json({ id: stored.id, ...authorization }, { status: 201, headers: OF_HEADERS });
  } catch (error) {
    if(cleanup){
      try{
        if(!scope.companyId)throw Error("OF_COMPANY_SCOPE_MISSING");
        const {error:queueError}=await getSupabase().rpc("zelo_of_register_retirement",{p_owner:scope.userId,p_company:scope.companyId,p_mode:scope.mode,p_consent:cleanup});
        if(queueError)throw Error("OF_RETIREMENT_UNAVAILABLE");
      }catch{try{await revokeProductionConsent(polpUuid(cleanup.id),scope.userId);}catch{console.error("[open-finance] Falha ao registrar cancelamento após criação não concluída");}}
    }
    const invalid = error instanceof Error && /^(INVALID_(INPUT|TERMS|DOCUMENT|ID|INSTITUTION))$/.test(error.message);
    return NextResponse.json({ error: invalid ? "Confira o banco, os documentos e o aceite para continuar." : "Não foi possível iniciar a conexão. Tente novamente em instantes." }, { status: invalid ? 400 : 503, headers: OF_HEADERS });
  }
}
