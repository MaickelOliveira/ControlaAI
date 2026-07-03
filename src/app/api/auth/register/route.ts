import { NextRequest, NextResponse } from "next/server";
import { createUser, getUserByEmail } from "@/lib/users";
import { signToken, setSessionCookie } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { name, email, password, phone, plan, company } = await req.json();
  if (!name || !email || !password || !phone) return NextResponse.json({ error: "Campos obrigatórios" }, { status: 400 });
  if (password.length < 6) return NextResponse.json({ error: "Senha mínimo 6 caracteres" }, { status: 400 });
  if (getUserByEmail(email)) return NextResponse.json({ error: "Email já cadastrado" }, { status: 409 });

  const user = await createUser({ name, email, password, phone, plan: plan || "personal", company });
  const token = await signToken({ sub: user.id, name: user.name, email: user.email, plan: user.plan, role: "client" });
  await setSessionCookie(token);

  return NextResponse.json({ ok: true, user: { id: user.id, name: user.name, email: user.email, plan: user.plan, status: user.status } }, { status: 201 });
}
