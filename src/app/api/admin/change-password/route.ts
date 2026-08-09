import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { validateAdmin, setAdminPassword } from "@/lib/admin";

export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { email, currentPassword, newPassword } = await req.json();
  if (!email || !currentPassword || !newPassword) return NextResponse.json({ error: "Campos obrigatórios" }, { status: 400 });
  if (newPassword.length < 8) return NextResponse.json({ error: "Nova senha precisa ter pelo menos 8 caracteres" }, { status: 400 });

  const ok = await validateAdmin(session.email, currentPassword);
  if (!ok) return NextResponse.json({ error: "Senha atual incorreta" }, { status: 401 });

  await setAdminPassword(email, newPassword);
  return NextResponse.json({ ok: true });
}
