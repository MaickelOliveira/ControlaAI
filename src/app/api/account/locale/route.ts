import { NextRequest, NextResponse } from "next/server";
import { getSession, invalidateUserAuthCache } from "@/lib/auth";
import { updateUser, getUserById, type UserLocale } from "@/lib/users";

const VALID_LOCALES: UserLocale[] = ["pt-BR", "pt-PT", "es"];

// Troca o idioma da conta — chamado automaticamente ao logar pela versão
// /es ou /pt do login (ver src/app/es/login e src/app/pt/login), pra quem
// já tinha conta em pt-BR passar a receber o bot/e-mails no idioma certo
// sem precisar de nenhuma tela extra.
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "client") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { locale } = await req.json();
  if (!VALID_LOCALES.includes(locale)) return NextResponse.json({ error: "locale inválido" }, { status: 400 });

  await updateUser(session.sub, { locale });
  invalidateUserAuthCache(session.sub);
  const user = await getUserById(session.sub);
  return NextResponse.json({ ok: true, locale: user?.locale });
}
