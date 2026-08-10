import { getSupabase } from "./supabase";
import { phoneVariants } from "./conversations";

export type WppPhoneAccess = "personal" | "business" | "both";

export type WppPhoneLink = {
  phone: string;
  userId: string;
  name?: string;
  relation?: string;
  access: WppPhoneAccess;
  linkedAt: string;
};

type Row = { phone: string; user_id: string; name: string | null; relation: string | null; access: WppPhoneAccess; linked_at: string };

function fromRow(r: Row): WppPhoneLink {
  return { phone: r.phone, userId: r.user_id, name: r.name ?? undefined, relation: r.relation ?? undefined, access: r.access, linkedAt: r.linked_at };
}

export async function getPhonesForUser(userId: string): Promise<WppPhoneLink[]> {
  const { data, error } = await getSupabase().from("wpp_phone_links").select("*").eq("user_id", userId);
  if (error) { console.error("[wpp-phone-links] getPhonesForUser erro:", error.message); return []; }
  return (data as Row[]).map(fromRow);
}

export async function countPhonesForUser(userId: string): Promise<number> {
  const { count, error } = await getSupabase().from("wpp_phone_links").select("phone", { count: "exact", head: true }).eq("user_id", userId);
  if (error) return 0;
  return count ?? 0;
}

/** Busca o dono de um telefone que chegou via WhatsApp — tenta todas as
 *  variantes de formatação (com/sem 55, com/sem 9º dígito), mesma
 *  normalização já usada em conversations.ts. Consulta indexada direta na
 *  chave primária em vez de escanear todos os usuários e seus arrays de
 *  telefone comparando um a um (como era antes com o campo no `users`). */
export async function getUserIdByPhone(phone: string): Promise<string | null> {
  const variants = phoneVariants(phone);
  const { data, error } = await getSupabase().from("wpp_phone_links").select("phone, user_id").in("phone", variants);
  if (error || !data || data.length === 0) return null;
  const rows = data as Array<{ phone: string; user_id: string }>;
  for (const v of variants) {
    const row = rows.find(r => r.phone === v);
    if (row) return row.user_id;
  }
  return null;
}

export type LinkResult = "ok" | "already_linked_elsewhere";

/** Vincula um telefone a um usuário. `phone` é chave primária da tabela —
 *  a UNIQUE constraint garante que o mesmo número nunca fica vinculado a
 *  duas contas ao mesmo tempo (antes, um array por usuário sem nenhuma
 *  checagem de unicidade global permitia isso). */
export async function linkPhone(userId: string, phone: string): Promise<LinkResult> {
  const { error } = await getSupabase().from("wpp_phone_links").insert({ phone, user_id: userId, access: "both" });
  if (!error) return "ok";
  if (error.code === "23505") {
    const { data } = await getSupabase().from("wpp_phone_links").select("user_id").eq("phone", phone).maybeSingle();
    if ((data as { user_id: string } | null)?.user_id === userId) return "ok"; // já vinculado a este mesmo usuário — idempotente
    return "already_linked_elsewhere";
  }
  console.error("[wpp-phone-links] linkPhone erro:", error.message);
  return "already_linked_elsewhere"; // erro desconhecido — mais seguro bloquear do que deixar vincular
}

export async function unlinkPhone(userId: string, phone: string): Promise<void> {
  await getSupabase().from("wpp_phone_links").delete().eq("phone", phone).eq("user_id", userId);
}

export async function setPhoneName(userId: string, phone: string, name: string): Promise<void> {
  await getSupabase().from("wpp_phone_links").update({ name: name.trim() }).eq("phone", phone).eq("user_id", userId);
}

export async function setPhoneRelation(userId: string, phone: string, relation: string): Promise<void> {
  await getSupabase().from("wpp_phone_links").update({ relation: relation.trim() }).eq("phone", phone).eq("user_id", userId);
}

export async function setPhoneAccess(userId: string, phone: string, access: WppPhoneAccess): Promise<void> {
  await getSupabase().from("wpp_phone_links").update({ access }).eq("phone", phone).eq("user_id", userId);
}

function normalizeName(name: string): string {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
}

/** Acha o telefone vinculado cujo nome cadastrado combina com o informado
 *  (ex: "Ana" -> o telefone cujo name === "Ana"). */
export async function findPhoneByName(userId: string, name: string): Promise<string | undefined> {
  const target = normalizeName(name);
  const phones = await getPhonesForUser(userId);
  return phones.find(p => p.name && normalizeName(p.name) === target)?.phone;
}

/** Acha o telefone vinculado cujo vínculo cadastrado combina com o termo
 *  informado (ex: "esposa" -> o telefone cujo relation === "Esposa") — usado
 *  quando a pergunta cita um vínculo familiar/social em vez de um nome
 *  próprio (ex: "quanto minha esposa gastou"). */
export async function findPhoneByRelation(userId: string, relation: string): Promise<string | undefined> {
  const target = normalizeName(relation);
  const phones = await getPhonesForUser(userId);
  return phones.find(p => p.relation && normalizeName(p.relation) === target)?.phone;
}

/** Modo que a pessoa desse número pode acessar — "both" por padrão. */
export async function getPhoneAccess(userId: string, phone: string): Promise<WppPhoneAccess> {
  const { data } = await getSupabase().from("wpp_phone_links").select("access").eq("phone", phone).eq("user_id", userId).maybeSingle();
  return (data as { access: WppPhoneAccess } | null)?.access ?? "both";
}
