import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, clearAdminSession } from "@/lib/auth";
import { validateAdmin, setAdminPassword } from "@/lib/admin";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const email = body?.email, currentPassword = body?.currentPassword, newPassword = body?.newPassword;
  if (typeof email !== "string" || !email.trim() || email.length > 254 || typeof currentPassword !== "string" || !currentPassword || currentPassword.length > 128 || typeof newPassword !== "string" || newPassword.length < 12 || newPassword.length > 128) return NextResponse.json({ error: "Informe um e-mail válido e uma nova senha de 12 a 128 caracteres" }, { status: 400 });
  if (!await checkRateLimit(`admin-change-password:${session.email}`, 5, 15 * 60_000)) {
    return NextResponse.json({ error: "Muitas tentativas. Aguarde 15 minutos." }, { status: 429 });
  }

  try {
    const ok = await validateAdmin(session.email, currentPassword);
    if (!ok) return NextResponse.json({ error: "Senha atual incorreta" }, { status: 401 });
    await setAdminPassword(email, newPassword);
    await clearAdminSession();
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Não foi possível alterar as credenciais agora. Tente novamente." }, { status: 503 });
  }
}
