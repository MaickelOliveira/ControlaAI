import "server-only";
import { createCompany, getCompanies, multiCompanyEnabled, requireCompany, type Company } from "./companies";
import { currentCompanyContext, runWithCompanyContext, setCompanyContext } from "./company-context";
import { getUserById, hasAccess, type User } from "./users";
import { getPhonesForUser, getUserIdByPhone, setPhoneWorkspace } from "./wpp-phone-links";
import { addMessage, getAiPaused, phoneVariants } from "./conversations";
import { clearPendingAction, getPendingAction, setPendingAction } from "./pending-actions";
import { checkRateLimit } from "./rate-limit";
import { sendText } from "./whatsapp";
import { looksLikeNewCommand } from "./slot-filling";
import type { IncomingMessage } from "./message-handler";

const normalize = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase();
function asksForBusinessWorkspace(text: string): boolean {
  const value = normalize(text);
  return /\b(?:empresa|empresarial|negocio|pj|funcionarios?|colaboradores?|clientes?|fornecedores?|nota(?:s)? fiscal(?:is)?|folha de pagamento|pro labore)\b/.test(value);
}
function isModeSwitchToPersonal(text: string): boolean {
  return /^(?:muda|mude|mudar|troca|troque|trocar|passa|passe|passar|ir|usar|usa|quero|voltar|cambia|cambie|cambiar|pasa|pase|pasar|quiero|volver)\s+(?:(?:para|pro|ao|a|el|o|no|en)\s+)?(?:(?:modo|espaco|area|conta)\s+)?(?:pessoal|personal)$/.test(normalize(text).replace(/[.!?]+$/, ""));
}
function isGeneralConversation(text: string): boolean {
  const value = normalize(text);
  return /^(?:oi|ola|bom dia|boa tarde|boa noite|buenos dias|buenas tardes|buenas noches)(?:\s+(?:zelo|tudo bem))?[.!? ]*$/.test(value)
    || /^(?:obrigad[oa]|gracias|valeu|ajuda|ayuda|help|menu|comandos|o que voce faz)[.!? ]*$/.test(value);
}
function startsNewRequest(text: string): boolean {
  return looksLikeNewCommand(text) || /^(?:crie|cadastre|registre|lance|adicione|inclua|edite|altere|atualize|apague|exclua|remova|mostre|liste|consulte|resuma|fa[cç]a|quiero|registr[eé]|agregue|edite|borre|elimine|muestre|liste|consulte|resuma)\b/.test(normalize(text));
}
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
function activate(userId: string, company: Company, mode: "personal" | "business", access: string, archivedCompanyIds:string[]=[]) {
  setCompanyContext({ userId, companyId: company.id, mode, archivedCompanyIds, allowBusiness: access !== "personal", allowPersonal: access !== "business", companyName: company.name,
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
    const all=await getCompanies(user.id,true),companies=all.filter(c=>!c.archivedAt),archivedCompanyIds=all.filter(c=>c.archivedAt).map(c=>c.id);
    const mode = link.access === "both" ? link.activeWorkspaceMode ?? user.activeMode : link.access;
    let selected = link.activeCompanyId ? companies.find(company => company.id === link.activeCompanyId) : undefined;
    if (link.activeCompanyId && !selected) {
      await clearPendingAction(msg.from);
      await sendText(msg.from,es?"La empresa seleccionada ya no está activa. Elige otra empresa antes de repetir el pedido.":"A empresa selecionada não está mais ativa. Escolha outra antes de repetir o pedido.");return;
    }
    const pending = await getPendingAction(msg.from);
    if(pending&&pending.userId!==user.id){await clearPendingAction(msg.from);throw Error("COMPANY_OWNER_MISMATCH");}
    const pendingMode=pending?.workspaceMode??(pending&&"mode" in pending&&(pending.mode==="personal"||pending.mode==="business")?pending.mode:undefined);
    if(pendingMode&&pendingMode!==mode&&!companyCommand){
      await clearPendingAction(msg.from);await sendText(msg.from,es?"El pedido pendiente pertenece a otro modo. Hazlo nuevamente en el modo correcto.":"O pedido pendente pertence a outro modo. Faça novamente no modo correto.");return;
    }
    if(pending?.type==="company_selection"&&/^(cancelar|cancela|cancel|salir|sair)$/i.test(normalized)){
      await clearPendingAction(msg.from);await sendText(msg.from,es?"Selección cancelada. No registré ningún movimiento.":"Escolha cancelada. Nenhuma movimentação foi registrada.");return;
    }
    async function ask(resume?: IncomingMessage) {
      await setPendingAction(msg.from, { type: "company_selection", userId: user!.id,
        ...(resume ? { resume: { text: resume.text, channel:resume.channel,providerMessageId:resume.providerMessageId,receivedAt:resume.receivedAt,isFileMessage: resume.isFileMessage, fileMimeType: resume.fileMimeType,
          fileName: resume.fileName, contactName: resume.contactName, fileBase64: resume.fileBuffer?.toString("base64") } } : {}) });
      await addMessage(msg.from, { role: "user", content: msg.text || "[Arquivo]", ts:msg.receivedAt??Date.now(),channel:msg.channel });
      await sendText(msg.from, `${es ? "¿En qué empresa quieres hacer este pedido?" : "Em qual empresa você quer fazer este pedido?"}\n\n${companies.map((company, index) => `${index + 1}. ${company.name}`).join("\n")}\n\n${es ? "Responde con el nombre o número. Para desistir, escribe cancelar." : "Responda com o nome ou número. Para desistir, escreva cancelar."}`);
    }
    if (createCommand) {
      if (!await checkRateLimit(`company-create:${user.id}`, 10, 60_000)) { await sendText(msg.from, "Aguarde um pouco antes de cadastrar outra empresa."); return; }
      selected = await createCompany(user.id, createCommand[1]);
      await setPhoneWorkspace(user.id, link.phone, selected.id, "business"); await clearPendingAction(msg.from);
      activate(user.id, selected, "business", link.access,archivedCompanyIds);
      await sendText(msg.from, es ? `Empresa *${selected.name}* creada. Tus próximos pedidos usarán esta empresa.` : `Empresa *${selected.name}* cadastrada. Seus próximos pedidos usarão essa empresa.`); return;
    }
    if(!companies.length){
      if(mode==="personal"&&!companyCommand){
        const company=all.find(c=>c.isDefault)??all[0];if(!company)throw Error("COMPANY_REQUIRED");
        setCompanyContext({userId:user.id,companyId:company.id,mode:"personal",allowBusiness:false,archivedCompanyIds});
        if(pending?.companyId&&pendingMode!=="personal"){await clearPendingAction(msg.from);await sendText(msg.from,es?"La empresa del pedido ya no está activa. Haz un nuevo pedido en modo personal.":"A empresa do pedido não está mais ativa. Faça um novo pedido no modo Pessoal.");return;}
        return next(msg);
      }
      await clearPendingAction(msg.from);await sendText(msg.from,es?"No hay empresas activas. Registra o restaura una en Zelo antes de hacer pedidos empresariales.":"Você não tem empresas ativas. Cadastre ou restaure uma na Zelo antes de fazer pedidos empresariais.");return;
    }
    if (listCommand) { await ask(); return; }
    if (switchCommand || pending?.type === "company_selection") {
      if (link.access === "personal") { await clearPendingAction(msg.from); const personal=await requireCompany(user.id);activate(user.id,personal,"personal",link.access,archivedCompanyIds);return next(msg); }
      const choice = companyChoice(switchCommand?.[1] ?? text, companies);
      if (!choice) { await ask(pending?.type === "company_selection" && pending.resume ? {
        from: msg.from, ...pending.resume, fileBuffer: pending.resume.fileBase64 ? Buffer.from(pending.resume.fileBase64, "base64") : undefined,
      } : undefined); return; }
      selected = await requireCompany(user.id, choice);
      await setPhoneWorkspace(user.id, link.phone, selected.id, "business"); await clearPendingAction(msg.from);
      activate(user.id, selected, "business", link.access,archivedCompanyIds);
      if (pending?.type === "company_selection" && pending.resume && !switchCommand) {
        await next({ from: msg.from, ...pending.resume, fileBuffer: pending.resume.fileBase64 ? Buffer.from(pending.resume.fileBase64, "base64") : undefined });
      } else await sendText(msg.from, es ? `Ahora estás en *${selected.name}*.` : `Agora você está em *${selected.name}*.`);
      return;
    }
    // A escolha guardada no telefone serve para continuar uma conversa, mas
    // não autoriza um novo pedido em uma das várias empresas do titular.
    // Perguntamos antes de chamar qualquer ação/consulta do agente.
    const newRequest = !pending || startsNewRequest(text);
    if (companies.length > 1 && link.access !== "personal" && newRequest
      && !isModeSwitchToPersonal(text) && !isGeneralConversation(text)
      && (mode === "business" || asksForBusinessWorkspace(text))) {
      await ask(msg); return;
    }
    if (!selected && mode === "business" && companies.length > 0) { await ask(msg); return; }
    selected ??= companies.find(company => company.isDefault)??companies[0];
    if (!selected) throw Error("COMPANY_NOT_FOUND");
    if (!link.activeCompanyId || !link.activeWorkspaceMode) await setPhoneWorkspace(user.id, link.phone, selected.id, mode);
    activate(user.id, selected, mode, link.access,archivedCompanyIds);
    if (pending?.companyId && pendingMode!=="personal" && pending.companyId !== selected.id) {
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
