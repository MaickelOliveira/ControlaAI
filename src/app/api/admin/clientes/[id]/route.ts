import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getAdminSession, invalidateUserAuthCache } from "@/lib/auth";
import { isValidNewPassword } from "@/lib/password-reset";
import { checkRateLimit } from "@/lib/rate-limit";
import { getUserById, hasAccess, updateUser, deleteUser, activateUser, deactivateUser } from "@/lib/users";

type Params = Promise<{ id: string }>;

export async function PATCH(req: NextRequest, { params }: { params: Params }) {
  const session = await getAdminSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { action, trialDays, maxWppPhones, priceOverride, newPassword } = body;

  const user = await getUserById(id);
  if (!user) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });

  if (action === "set_password") {
    if (!hasAccess(user) || !user.email || user.email.endsWith("@whatsapp.controlaai.app")) {
      return NextResponse.json({ error: "A senha provisória exige um cliente ativo com e-mail cadastrado." }, { status: 409 });
    }
    if (!isValidNewPassword(newPassword) || bcrypt.truncates(newPassword) || !newPassword.trim()) {
      return NextResponse.json({ error: "Digite uma senha com pelo menos 10 caracteres e até 72 bytes." }, { status: 400 });
    }
    if (!await checkRateLimit(`admin:client-password:${id}`, 5, 15 * 60_000)) {
      return NextResponse.json({ error: "Muitas tentativas. Aguarde 15 minutos." }, { status: 429 });
    }
    const passwordHash = await bcrypt.hash(newPassword, 10);
    const updated = await updateUser(id, { passwordHash, passwordChangedAt: new Date().toISOString() });
    if (!updated) {
      return NextResponse.json({ error: "Não foi possível salvar a senha. Tente novamente." }, { status: 503 });
    }
    invalidateUserAuthCache(id);
  } else if (action === "activate") {
    await activateUser(id);
  } else if (action === "deactivate") {
    await deactivateUser(id);
  } else if (action === "extend_trial") {
    const days = Number(trialDays) || 14;
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + days);
    await updateUser(id, { status: "trial", trialEndsAt: trialEnd.toISOString() });
  } else if (action === "set_wpp_limit") {
    const limit = Math.max(1, Number(maxWppPhones) || 1);
    await updateUser(id, { maxWppPhones: limit });
  } else if (action === "set_price_override") {
    // priceOverride vazio/null/0 remove a exceção e volta a usar o preço padrão do plano
    const value = priceOverride === "" || priceOverride === null || priceOverride === undefined ? undefined : Number(priceOverride);
    await updateUser(id, { priceOverride: value !== undefined && !isNaN(value) && value > 0 ? value : undefined });
  } else {
    return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Params }) {
  const session = await getAdminSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;
  try {
    await deleteUser(id);
    return NextResponse.json({ ok: true });
  } catch(error) {
    if(error instanceof Error&&error.message==="OF_CLIENT_HISTORY_PROTECTED")return NextResponse.json({error:"Este cliente tem histórico bancário que deve ser preservado. Use Desativar para encerrar o acesso e cancelar os vínculos bancários."},{status:409});
    return NextResponse.json({error:"Não foi possível excluir o cliente. Tente novamente."},{status:503});
  }
}
