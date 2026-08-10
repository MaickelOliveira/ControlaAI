import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getUserById, generateWppVerifyCode, getMaxWppPhones } from "@/lib/users";
import { getPhonesForUser, unlinkPhone, setPhoneName, setPhoneRelation, setPhoneAccess } from "@/lib/wpp-phone-links";

export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const user = await getUserById(session.sub);
  if (!user) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });

  const phones = await getPhonesForUser(user.id);
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

  await unlinkPhone(session.sub, phone);
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

  const links = await getPhonesForUser(session.sub);
  if (!links.some(link => link.phone === phone)) {
    return NextResponse.json({ error: "Número não vinculado a essa conta" }, { status: 400 });
  }

  if (name) await setPhoneName(session.sub, phone, name);
  if (relation) await setPhoneRelation(session.sub, phone, relation);
  if (access) await setPhoneAccess(session.sub, phone, access);

  const updated = await getPhonesForUser(session.sub);

  return NextResponse.json({
    ok: true,
    wppPhoneNames: Object.fromEntries(updated.filter(link => link.name).map(link => [link.phone, link.name])),
    wppPhoneRelations: Object.fromEntries(updated.filter(link => link.relation).map(link => [link.phone, link.relation])),
    wppPhoneAccess: Object.fromEntries(updated.map(link => [link.phone, link.access])),
  });
}
