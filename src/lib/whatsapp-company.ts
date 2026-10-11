import "server-only";
import { createCompany, getCompanies, multiCompanyEnabled, requireCompany, type Company } from "./companies";
import { currentCompanyContext, runWithCompanyContext, setCompanyContext } from "./company-context";
import { getUserById, hasAccess, type User } from "./users";
import { getPhonesForUser, getUserIdByPhone, setPhoneWorkspace } from "./wpp-phone-links";
import { addMessage, getAiPaused, phoneVariants } from "./conversations";
import { clearPendingAction, getPendingAction, setPendingAction } from "./pending-actions";
import { checkRateLimit } from "./rate-limit";
import { sendText } from "./whatsapp";
import type { IncomingMessage } from "./message-handler";

const normalize = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase();
export function companyChoice(text: string, companies: Pick<Company, "id" | "name">[]): Company["id"] | undefined {
  const normalized = normalize(text);
  if (/^\d+$/.test(normalized)) return companies[Number(normalized) - 1]?.id;
  const matches = companies.filter(company => normalize(company.name) === normalized);
  return matches.length === 1 ? matches[0].id : undefined;
}
export function contextualCompanyUser(user: User): User {
  const scope = currentCompanyContext();
  if (!scope) return user;
  if (scope.userId !== user.id) throw Error("COMPANY_OWNER_MISMATCH");
  return { ...user, activeMode: scope.mode, ...(scope.mode === "business" ? {
    company: scope.companyName, customCategoriesExpense: scope.customCategoriesExpense, customCategoriesIncome: scope.customCategoriesIncome,
  } : {}) };
}
function activate(userId: string, company: Company, mode: "personal" | "business", access: string) {
  setCompanyContext({ userId, companyId: company.id, mode, allowBusiness: access !== "personal", companyName: company.name,
    customCategoriesExpense: company.customCategoriesExpense, customCategoriesIncome: company.customCategoriesIncome });
}
/** Selection belongs to this verified participant; web selection is independent. */
export async function withWhatsAppCompany(msg: IncomingMessage, next: (message: IncomingMessage) => Promise<void>): Promise<void> {
  if (!multiCompanyEnabled()) return next(msg);
  return runWithCompanyContext(async () => {
    const userId = await getUserIdByPhone(msg.from), user = userId ? await getUserById(userId) : null;
    if (!user || !hasAccess(user) || await getAiPaused(msg.from)) return next(msg);
    const variants = phoneVariants(msg.from);
    const links = await getPhonesForUser(user.id);
    const link = variants.map(phone => links.find(item => item.phone === phone)).find(Boolean);
    if (!link) throw Error("COMPANY_ACCESS_DENIED");
    const es = user.locale === "es", text = msg.text.trim(), normalized = normalize(text);
    const listCommand = /^(?:empresas|minhas empresas|listar empresas|ver empresas|mis empresas|listar empresas)$/i.test(normalized);
    const switchCommand = normalized.match(/^(?:usar|trocar(?: para)?|mudar(?: para)?|selecionar|cambiar(?: a)?) (?:a )?empresa(?: (.+))?$/);
    const createCommand = text.match(/^(?:cadastrar|criar|adicionar|crear) (?:uma |una )?(?:nova |nueva )?empresa\s+(.+)$/i);
    const companyCommand = listCommand || switchCommand || createCommand;
    if (companyCommand && link.access === "personal") {
      await sendText(msg.from, es ? "Este número solo tiene acceso al modo personal." : "Este número tem acesso somente ao modo pessoal."); return;
    }
    const companies = await getCompanies(user.id);
    const mode = link.access === "both" ? link.activeWorkspaceMode ?? user.activeMode : link.access;
    let selected = link.activeCompanyId ? companies.find(company => company.id === link.activeCompanyId) : undefined;
    if (link.activeCompanyId && !selected) throw Error("COMPANY_NOT_FOUND");
    const pending = await getPendingAction(msg.from);
    if(pending&&pending.userId!==user.id){await clearPendingAction(msg.from);throw Error("COMPANY_OWNER_MISMATCH");}
    if(pending?.type==="company_selection"&&/^(cancelar|cancela|cancel|salir|sair)$/i.test(normalized)){
      await clearPendingAction(msg.from);await sendText(msg.from,es?"Selección cancelada. No registré ningún movimiento.":"Escolha cancelada. Nenhuma movimentação foi registrada.");return;
    }
    async function ask(resume?: IncomingMessage) {
      await setPendingAction(msg.from, { type: "company_selection", userId: user!.id,
        ...(resume ? { resume: { text: resume.text, isFileMessage: resume.isFileMessage, fileMimeType: resume.fileMimeType,
          fileName: resume.fileName, contactName: resume.contactName, fileBase64: resume.fileBuffer?.toString("base64") } } : {}) });
      await addMessage(msg.from, { role: "user", content: msg.text || "[Arquivo]", ts: Date.now() });
      await sendText(msg.from, `${es ? "¿Qué empresa quieres usar?" : "Qual empresa você quer usar?"}\n\n${companies.map((company, index) => `${index + 1}. ${company.name}`).join("\n")}\n\n${es ? "Responde con el nombre o número." : "Responda com o nome ou número."}`);
    }
    if (createCommand) {
      if (!await checkRateLimit(`company-create:${user.id}`, 10, 60_000)) { await sendText(msg.from, "Aguarde um pouco antes de cadastrar outra empresa."); return; }
      selected = await createCompany(user.id, createCommand[1]);
      await setPhoneWorkspace(user.id, link.phone, selected.id, "business"); await clearPendingAction(msg.from);
      activate(user.id, selected, "business", link.access);
      await sendText(msg.from, es ? `Empresa *${selected.name}* creada. Tus próximos pedidos usarán esta empresa.` : `Empresa *${selected.name}* cadastrada. Seus próximos pedidos usarão essa empresa.`); return;
    }
    if (listCommand) { await ask(); return; }
    if (switchCommand || pending?.type === "company_selection") {
      if (link.access === "personal") { await clearPendingAction(msg.from); const personal=await requireCompany(user.id);activate(user.id,personal,"personal",link.access);return next(msg); }
      const choice = companyChoice(switchCommand?.[1] ?? text, companies);
      if (!choice) { await ask(pending?.type === "company_selection" && pending.resume ? {
        from: msg.from, ...pending.resume, fileBuffer: pending.resume.fileBase64 ? Buffer.from(pending.resume.fileBase64, "base64") : undefined,
      } : undefined); return; }
      selected = await requireCompany(user.id, choice);
      await setPhoneWorkspace(user.id, link.phone, selected.id, "business"); await clearPendingAction(msg.from);
      activate(user.id, selected, "business", link.access);
      if (pending?.type === "company_selection" && pending.resume && !switchCommand) {
        await next({ from: msg.from, ...pending.resume, fileBuffer: pending.resume.fileBase64 ? Buffer.from(pending.resume.fileBase64, "base64") : undefined });
      } else await sendText(msg.from, es ? `Ahora estás en *${selected.name}*.` : `Agora você está em *${selected.name}*.`);
      return;
    }
    if (!selected && mode === "business" && companies.length > 1) { await ask(msg); return; }
    selected ??= companies.find(company => company.isDefault);
    if (!selected) throw Error("COMPANY_NOT_FOUND");
    if (!link.activeCompanyId || !link.activeWorkspaceMode) await setPhoneWorkspace(user.id, link.phone, selected.id, mode);
    activate(user.id, selected, mode, link.access);
    if (pending?.companyId && pending.companyId !== selected.id) {
      await clearPendingAction(msg.from);
      await sendText(msg.from, es ? "La acción pendiente pertenece a otra empresa. Haz el pedido nuevamente en la empresa correcta." : "A ação pendente pertence a outra empresa. Faça o pedido novamente na empresa correta."); return;
    }
    await next(msg);
  });
}
export async function switchPhoneCompanyMode(userId: string, phone: string, mode: "personal" | "business") {
  const scope = currentCompanyContext(); if (!scope || scope.userId !== userId) throw Error("COMPANY_CONTEXT_MISSING");
  const variants = phoneVariants(phone), link = (await getPhonesForUser(userId)).find(item => variants.includes(item.phone));
  if (!link || link.access !== "both") throw Error("COMPANY_ACCESS_DENIED");
  await setPhoneWorkspace(userId, link.phone, scope.companyId, mode);
}
