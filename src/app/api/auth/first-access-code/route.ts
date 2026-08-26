import { NextRequest, NextResponse } from "next/server";
import { sendFirstAccessCodeEmail } from "@/lib/brevo";
import { createPasswordResetCode, getPasswordSetupUserId, invalidatePasswordResetCode } from "@/lib/password-reset";
import { checkRateLimit } from "@/lib/rate-limit";
import { getRequestIp } from "@/lib/request-ip";
import { getUserById } from "@/lib/users";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const setupId = typeof body.setupId === "string" ? body.setupId : "";
  if (!/^[0-9a-f-]{36}$/i.test(setupId)) return NextResponse.json({ error: "Link inválido ou expirado" }, { status: 400 });

  const [ipAllowed, linkAllowed] = await Promise.all([
    checkRateLimit(`first-access:ip:${getRequestIp(req)}`, 10, 60 * 60_000),
    checkRateLimit(`first-access:link:${setupId}`, 3, 60 * 60_000),
  ]);
  if (!ipAllowed || !linkAllowed) return NextResponse.json({ error: "Muitas tentativas. Aguarde alguns minutos." }, { status: 429 });

  const userId = await getPasswordSetupUserId(setupId);
  if (!userId) return NextResponse.json({ error: "Este link expirou ou já foi utilizado" }, { status: 400 });
  const user = await getUserById(userId);
  if (!user || user.status !== "active" || user.email.endsWith("@whatsapp.controlaai.app")) {
    return NextResponse.json({ error: "Não foi possível liberar este acesso" }, { status: 400 });
  }

  const reset = await createPasswordResetCode(user.id);
  try {
    await sendFirstAccessCodeEmail({ email: user.email, name: user.name, code: reset.code, locale: user.locale });
  } catch (error) {
    await invalidatePasswordResetCode(reset.id);
    console.error("[first-access] envio do código falhou", error);
    return NextResponse.json({ error: "Não foi possível enviar o código. Fale com o suporte." }, { status: 502 });
  }

  const [local, domain = ""] = user.email.split("@");
  const maskedEmail = `${local.slice(0, 2)}${"*".repeat(Math.max(2, local.length - 2))}@${domain}`;
  return NextResponse.json({ ok: true, requestId: reset.id, maskedEmail });
}
