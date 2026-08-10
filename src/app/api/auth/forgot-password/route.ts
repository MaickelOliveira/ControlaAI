import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { sendPasswordResetEmail } from "@/lib/brevo";
import { createPasswordResetCode, invalidatePasswordResetCode } from "@/lib/password-reset";
import { checkRateLimit } from "@/lib/rate-limit";
import { getRequestIp } from "@/lib/request-ip";
import { getUserByEmail } from "@/lib/users";

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  const body = await req.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || email.length > 254) return NextResponse.json({ error: "Informe um e-mail válido" }, { status: 400 });
  const [ipAllowed, accountAllowed] = await Promise.all([
    checkRateLimit(`forgot-password:ip:${getRequestIp(req)}`, 10, 60 * 60_000),
    checkRateLimit(`forgot-password:account:${email}`, 3, 15 * 60_000),
  ]);
  if (!ipAllowed || !accountAllowed) return NextResponse.json({ error: "Muitas tentativas. Aguarde alguns minutos." }, { status: 429 });

  let requestId: string = randomUUID();
  const user = await getUserByEmail(email);
  if (user && !user.email.endsWith("@whatsapp.controlaai.app")) {
    const reset = await createPasswordResetCode(user.id);
    requestId = reset.id;
    try {
      await sendPasswordResetEmail({ email: user.email, name: user.name, code: reset.code, resetId: reset.id });
    } catch (error) {
      await invalidatePasswordResetCode(reset.id);
      requestId = randomUUID();
      console.error(error);
    }
  }
  const delay = 350 - (Date.now() - startedAt);
  if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
  return NextResponse.json({ ok: true, requestId, message: "Se o e-mail estiver cadastrado, enviaremos um código de recuperação." });
}
