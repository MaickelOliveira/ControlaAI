import { NextRequest, NextResponse } from "next/server";
import { validatePassword } from "@/lib/users";
import { signToken, setSessionCookie } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();
  if (!email || !password) return NextResponse.json({ error: "Campos obrigatórios" }, { status: 400 });

  const user = await validatePassword(email, password);
  if (!user) return NextResponse.json({ error: "Email ou senha incorretos" }, { status: 401 });

  const token = await signToken({ sub: user.id, name: user.name, email: user.email, plan: user.plan, role: "client" });
  await setSessionCookie(token);

  return NextResponse.json({ ok: true, user: { id: user.id, name: user.name, email: user.email, plan: user.plan, status: user.status, activeMode: user.activeMode } });
}
