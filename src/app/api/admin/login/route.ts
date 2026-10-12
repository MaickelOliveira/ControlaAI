import { NextRequest, NextResponse } from "next/server";
import { authenticateAdmin } from "@/lib/admin";
import { signToken, setAdminSessionCookie } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { getRequestIp } from "@/lib/request-ip";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = body?.email, password = body?.password;
  if (typeof email !== "string" || !email.trim() || email.length > 254 || typeof password !== "string" || !password || password.length > 128) return NextResponse.json({ error: "Informe e-mail e senha válidos" }, { status: 400 });

  const normalizedEmail = email.trim().toLowerCase();
  const [ipAllowed, accountAllowed] = await Promise.all([
    checkRateLimit(`admin-login:ip:${getRequestIp(req)}`, 15, 15 * 60_000),
    checkRateLimit(`admin-login:account:${normalizedEmail}`, 5, 15 * 60_000),
  ]);
  if (!ipAllowed || !accountAllowed) return NextResponse.json({ error: "Muitas tentativas. Aguarde 15 minutos." }, { status: 429 });

  try {
    const version = await authenticateAdmin(normalizedEmail, password);
    if (!version) return NextResponse.json({ error: "Credenciais inválidas" }, { status: 401 });
    const token = await signToken({ sub: "admin", name: "Administrador", email: normalizedEmail, plan: "admin", role: "admin" }, version);
    await setAdminSessionCookie(token); // cookie separado: ca_admin
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Não foi possível entrar agora. Tente novamente." }, { status: 503 });
  }
}
