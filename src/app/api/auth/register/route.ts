import { NextRequest, NextResponse } from "next/server";
import { createUser, getUserByEmail } from "@/lib/users";
import { signToken, setSessionCookie } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { getRequestIp } from "@/lib/request-ip";

export async function POST(req: NextRequest) {
  const { name, email, password, phone, plan, company } = await req.json();
  if (!name || !email || !password || !phone) return NextResponse.json({ error: "Campos obrigatórios" }, { status: 400 });
  if (password.length < 10) return NextResponse.json({ error: "Senha deve ter no mínimo 10 caracteres" }, { status: 400 });

  const normalizedEmail = String(email).trim().toLowerCase();
  const [ipAllowed, accountAllowed] = await Promise.all([
    checkRateLimit(`register:ip:${getRequestIp(req)}`, 5, 60 * 60_000),
    checkRateLimit(`register:account:${normalizedEmail}`, 3, 24 * 60 * 60_000),
  ]);
  if (!ipAllowed || !accountAllowed) return NextResponse.json({ error: "Muitas tentativas de cadastro. Tente novamente mais tarde." }, { status: 429 });
  if (await getUserByEmail(normalizedEmail)) return NextResponse.json({ error: "Email já cadastrado" }, { status: 409 });

  const user = await createUser({ name, email: normalizedEmail, password, phone, plan: plan || "personal", company });
  const token = await signToken({ sub: user.id, name: user.name, email: user.email, plan: user.plan, role: "client" });
  await setSessionCookie(token);

  return NextResponse.json({ ok: true, user: { id: user.id, name: user.name, email: user.email, plan: user.plan, status: user.status } }, { status: 201 });
}
