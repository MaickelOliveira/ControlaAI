import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getUserById, updateUser, validatePassword } from "@/lib/users";
import bcrypt from "bcryptjs";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "client") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { currentPassword, newPassword } = await req.json();
  if (!currentPassword || !newPassword) return NextResponse.json({ error: "Campos obrigatórios" }, { status: 400 });
  if (newPassword.length < 6) return NextResponse.json({ error: "Nova senha deve ter ao menos 6 caracteres" }, { status: 400 });

  const user = getUserById(session.sub);
  if (!user) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });

  const valid = await validatePassword(user.email, currentPassword);
  if (!valid) return NextResponse.json({ error: "Senha atual incorreta" }, { status: 400 });

  const passwordHash = await bcrypt.hash(newPassword, 10);
  updateUser(session.sub, { passwordHash });

  return NextResponse.json({ ok: true });
}
