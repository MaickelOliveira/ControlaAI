import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getUserById, generateWppVerifyCode, getWppPhones, getMaxWppPhones, removeWppPhone, setWppPhoneName, setWppPhoneRelation, setWppPhoneAccess } from "@/lib/users";

export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const user = await getUserById(session.sub);
  if (!user) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });

  const phones = getWppPhones(user);
  const max = getMaxWppPhones(user);
  if (phones.length >= max) {
    return NextResponse.json({ error: `Limite de ${max} número(s) atingido. Desvincule um número antes de adicionar outro.` }, { status: 400 });
  }

  const code = await generateWppVerifyCode(session.sub);
  return NextResponse.json({ code });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const phone = body.phone as string | undefined;

  if (!phone) return NextResponse.json({ error: "Número não informado" }, { status: 400 });

  await removeWppPhone(session.sub, phone);
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const phone = body.phone as string | undefined;
  const name = (body.name as string | undefined)?.trim().slice(0, 40);
  const relation = (body.relation as string | undefined)?.trim().slice(0, 30);
  const access = body.access as "personal" | "business" | "both" | undefined;

  if (!phone) return NextResponse.json({ error: "Número não informado" }, { status: 400 });
  if (!name && !relation && !access) return NextResponse.json({ error: "Nada para atualizar" }, { status: 400 });
  if (access && !["personal", "business", "both"].includes(access)) {
    return NextResponse.json({ error: "Acesso inválido" }, { status: 400 });
  }

  const user = await getUserById(session.sub);
  if (!user || !getWppPhones(user).includes(phone)) {
    return NextResponse.json({ error: "Número não vinculado a essa conta" }, { status: 400 });
  }

  let updated = user;
  if (name) updated = (await setWppPhoneName(session.sub, phone, name)) ?? updated;
  if (relation) updated = (await setWppPhoneRelation(session.sub, phone, relation)) ?? updated;
  if (access) updated = (await setWppPhoneAccess(session.sub, phone, access)) ?? updated;

  return NextResponse.json({
    ok: true,
    wppPhoneNames: updated.wppPhoneNames ?? {},
    wppPhoneRelations: updated.wppPhoneRelations ?? {},
    wppPhoneAccess: updated.wppPhoneAccess ?? {},
  });
}
