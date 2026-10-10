import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import {
  PolpSandboxError, createSandboxConsent, getSandboxSnapshot, listPolpInstitutions,
  listSandboxAccounts, listSandboxConsents, listSandboxTransactions,
} from "@/lib/polp-sandbox";
import { getFinancesByUser } from "@/lib/finances";
import { reconcilePolpSnapshot } from "@/lib/polp-reconciliation";

const headers = { "Cache-Control": "private, no-store" };
const json = (value: object, status = 200) => NextResponse.json(value, { status, headers });

async function access() {
  if (process.env.POLP_SANDBOX_ENABLED !== "true") return json({ error: "Teste desativado." }, 404);
  const session = await getAdminSession();
  return session?.role === "admin" ? null : json({ error: "Não autorizado." }, 401);
}

function failure(error: unknown) {
  return error instanceof PolpSandboxError
    ? json({ error: error.message }, error.status)
    : json({ error: "Falha ao consultar o sandbox da Polp." }, 502);
}

export async function GET(req: NextRequest) {
  const denied = await access();
  if (denied) return denied;
  const params = req.nextUrl.searchParams;
  const cursor = params.get("cursor") || undefined;
  try {
    switch (params.get("action")) {
      case "institutions": return json(await listPolpInstitutions(cursor));
      case "consents": return json(await listSandboxConsents(cursor));
      case "accounts": return json(await listSandboxAccounts(params.get("consentId") || "", cursor));
      case "transactions": return json(await listSandboxTransactions(params.get("accountId") || "", cursor));
      case "snapshot": {
        const snapshot = await getSandboxSnapshot(params.get("consentId") || "");
        const testUserId = process.env.POLP_SANDBOX_TEST_USER_ID;
        const mode = params.get("mode") === "business" ? "business" : "personal";
        const existing = testUserId ? await getFinancesByUser(testUserId, mode) : [];
        return json({ ...snapshot, reconciliation: reconcilePolpSnapshot(snapshot, existing, mode),
          comparedWithZelo: Boolean(testUserId) });
      }
      default: return json({ error: "Consulta inválida." }, 400);
    }
  } catch (error) { return failure(error); }
}

export async function POST(req: NextRequest) {
  const denied = await access();
  if (denied) return denied;
  if (req.headers.get("sec-fetch-site") === "cross-site") return json({ error: "Origem inválida." }, 403);
  try {
    const body: unknown = await req.json();
    const institutionId = body && typeof body === "object" && "institutionId" in body
      ? (body as { institutionId: unknown }).institutionId : null;
    if (typeof institutionId !== "string") return json({ error: "Selecione uma instituição." }, 400);
    return json(await createSandboxConsent(institutionId), 201);
  } catch (error) { return failure(error); }
}
