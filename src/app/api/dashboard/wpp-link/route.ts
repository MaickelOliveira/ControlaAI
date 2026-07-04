import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getUserById, generateWppVerifyCode, getWppPhones, getMaxWppPhones, removeWppPhone } from "@/lib/users";
import { getAdminWppConfig } from "@/lib/admin";

export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const user = getUserById(session.sub);
  if (!user) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });

  const phones = getWppPhones(user);
  const max = getMaxWppPhones(user);
  if (phones.length >= max) {
    return NextResponse.json({ error: `Limite de ${max} número(s) atingido. Desvincule um número antes de adicionar outro.` }, { status: 400 });
  }

  const code = generateWppVerifyCode(session.sub);
  const { wppSession } = getAdminWppConfig();
  return NextResponse.json({ code, session: wppSession });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const phone = body.phone as string | undefined;

  if (!phone) return NextResponse.json({ error: "Número não informado" }, { status: 400 });

  removeWppPhone(session.sub, phone);
  return NextResponse.json({ ok: true });
}
