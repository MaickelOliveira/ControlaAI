import { NextRequest, NextResponse } from "next/server";
import { validatePassword } from "@/lib/users";
import { signToken, setSessionCookie } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { getRequestIp } from "@/lib/request-ip";

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();
  if (!email || !password) return NextResponse.json({ error: "Campos obrigatórios" }, { status: 400 });

  const ip = getRequestIp(req);
  const normalizedEmail = String(email).trim().toLowerCase();
  const [ipAllowed, accountAllowed] = await Promise.all([
    checkRateLimit(`login:ip:${ip}`, 30, 15 * 60_000),
    checkRateLimit(`login:account:${normalizedEmail}`, 10, 15 * 60_000),
  ]);
  if (!ipAllowed || !accountAllowed) return NextResponse.json({ error: "Muitas tentativas. Aguarde 15 minutos." }, { status: 429 });

  const user = await validatePassword(normalizedEmail, password);
  if (!user) return NextResponse.json({ error: "Email ou senha incorretos" }, { status: 401 });

  const token = await signToken({ sub: user.id, name: user.name, email: user.email, plan: user.plan, role: "client" });
  await setSessionCookie(token);

  return NextResponse.json({ ok: true, user: { id: user.id, name: user.name, email: user.email, plan: user.plan, status: user.status, activeMode: user.activeMode } });
}
