import { NextRequest, NextResponse } from "next/server";
import { validateAdmin } from "@/lib/admin";
import { signToken, setAdminSessionCookie } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();
  if (!email || !password) return NextResponse.json({ error: "Campos obrigatórios" }, { status: 400 });

  const ok = await validateAdmin(email, password);
  if (!ok) return NextResponse.json({ error: "Credenciais inválidas" }, { status: 401 });

  const token = await signToken({ sub: "admin", name: "Administrador", email, plan: "admin", role: "admin" });
  await setAdminSessionCookie(token); // cookie separado: ca_admin
  return NextResponse.json({ ok: true });
}
