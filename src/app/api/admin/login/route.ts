import { NextRequest, NextResponse } from "next/server";
import { validateAdmin } from "@/lib/admin";
import { signToken, setAdminSessionCookie } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { getRequestIp } from "@/lib/request-ip";

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();
  if (!email || !password) return NextResponse.json({ error: "Campos obrigatórios" }, { status: 400 });

  const normalizedEmail = String(email).trim().toLowerCase();
  const [ipAllowed, accountAllowed] = await Promise.all([
    checkRateLimit(`admin-login:ip:${getRequestIp(req)}`, 15, 15 * 60_000),
    checkRateLimit(`admin-login:account:${normalizedEmail}`, 5, 15 * 60_000),
  ]);
  if (!ipAllowed || !accountAllowed) return NextResponse.json({ error: "Muitas tentativas. Aguarde 15 minutos." }, { status: 429 });

  const ok = await validateAdmin(normalizedEmail, password);
  if (!ok) return NextResponse.json({ error: "Credenciais inválidas" }, { status: 401 });

  const token = await signToken({ sub: "admin", name: "Administrador", email: normalizedEmail, plan: "admin", role: "admin" });
  await setAdminSessionCookie(token); // cookie separado: ca_admin
  return NextResponse.json({ ok: true });
}
