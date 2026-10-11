import { NextResponse } from "next/server";
import { getSessionWithUser } from "@/lib/auth";
import { isSameOrigin } from "@/lib/request-origin";
import { storeFiscalCertificate } from "@/lib/nfse";
import { checkRateLimit } from "@/lib/rate-limit";
import { boundedFiscalRequest } from "@/lib/nfse-request";
export async function POST(request: Request) {
 const headers = { "Cache-Control": "private, no-store" }, auth = await getSessionWithUser();
 if (!auth || auth.session.role !== "client" || auth.user.plan !== "business" || auth.user.activeMode !== "business" || auth.user.locale !== "pt-BR") return NextResponse.json({ error: "Não autorizado." }, { status: 403, headers });
 if (!isSameOrigin(request, process.env.OPEN_FINANCE_APP_ORIGIN || process.env.NEXT_PUBLIC_APP_URL)) return NextResponse.json({ error: "Origem não autorizada." }, { status: 403, headers });
 if (!await checkRateLimit(`nfse-certificate:${auth.user.id}`, 5, 60_000)) return NextResponse.json({ error: "Aguarde um pouco antes de tentar novamente." }, { status: 429, headers });
 const length = Number(request.headers.get("content-length")); if (length > 1_100_000) return NextResponse.json({ error: "Certificado muito grande." }, { status: 413, headers });
 try {
  const form = await (await boundedFiscalRequest(request, 1_100_000)).formData(), file = form.get("certificate"), password = form.get("password");
  if (!(file instanceof File) || file.size > 1_000_000 || typeof password !== "string" || password.length > 200) throw Error("Use um certificado A1 .pfx/.p12 de até 1 MB e sua senha.");
  return NextResponse.json(await storeFiscalCertificate(auth.user.id, Buffer.from(await file.arrayBuffer()), password), { headers });
 } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível guardar o certificado." }, { status: 400, headers }); }
}
