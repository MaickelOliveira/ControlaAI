import { NextRequest, NextResponse } from "next/server";
import { isValidNewPassword, isValidResetCode, resetPasswordWithCode } from "@/lib/password-reset";
import { checkRateLimit } from "@/lib/rate-limit";
import { getRequestIp } from "@/lib/request-ip";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const requestId = typeof body.requestId === "string" ? body.requestId : "";
  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!/^[0-9a-f-]{36}$/i.test(requestId) || !isValidResetCode(code)) return NextResponse.json({ error: "Código inválido ou expirado" }, { status: 400 });
  if (!isValidNewPassword(body.newPassword)) return NextResponse.json({ error: "A nova senha deve ter entre 10 e 128 caracteres" }, { status: 400 });
  const [ipAllowed, requestAllowed] = await Promise.all([
    checkRateLimit(`reset-password:ip:${getRequestIp(req)}`, 15, 15 * 60_000),
    checkRateLimit(`reset-password:request:${requestId}`, 5, 15 * 60_000),
  ]);
  if (!ipAllowed || !requestAllowed) return NextResponse.json({ error: "Muitas tentativas. Solicite um novo código." }, { status: 429 });
  if (!await resetPasswordWithCode(requestId, code, body.newPassword)) return NextResponse.json({ error: "Código inválido ou expirado" }, { status: 400 });
  return NextResponse.json({ ok: true });
}
