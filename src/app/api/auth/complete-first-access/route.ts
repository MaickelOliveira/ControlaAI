import { NextRequest, NextResponse } from "next/server";
import { completePasswordSetup, isValidNewPassword, isValidResetCode } from "@/lib/password-reset";
import { checkRateLimit } from "@/lib/rate-limit";
import { getRequestIp } from "@/lib/request-ip";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const setupId = typeof body.setupId === "string" ? body.setupId : "";
  const requestId = typeof body.requestId === "string" ? body.requestId : "";
  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!/^[0-9a-f-]{36}$/i.test(setupId) || !/^[0-9a-f-]{36}$/i.test(requestId) || !isValidResetCode(code)) {
    return NextResponse.json({ error: "Código ou link inválido" }, { status: 400 });
  }
  if (!isValidNewPassword(body.newPassword)) return NextResponse.json({ error: "A senha deve ter entre 10 e 128 caracteres" }, { status: 400 });
  const [ipAllowed, linkAllowed] = await Promise.all([
    checkRateLimit(`complete-first-access:ip:${getRequestIp(req)}`, 15, 15 * 60_000),
    checkRateLimit(`complete-first-access:link:${setupId}`, 5, 15 * 60_000),
  ]);
  if (!ipAllowed || !linkAllowed) return NextResponse.json({ error: "Muitas tentativas. Solicite um novo código." }, { status: 429 });
  if (!await completePasswordSetup(setupId, requestId, code, body.newPassword)) {
    return NextResponse.json({ error: "Código inválido ou expirado" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
