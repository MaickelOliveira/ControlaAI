import "server-only";
import type { User } from "./users";
import { getPhoneAccess } from "./wpp-phone-links";
import { fiscalOverview, createFiscalDraft } from "./nfse";
import { validateFiscalService, validateFiscalServiceAnswer, validFiscalDocument, type FiscalService } from "./nfse-validation";
import { setPendingAction, clearPendingAction, type PendingAction, type PendingFiscalDraft } from "./pending-actions";
import { sendText } from "./whatsapp";
const fields = ["title", "description", "nationalCode", "amount", "issTaxation", "withholding", "issRate", "estimatedFederal", "estimatedState", "estimatedMunicipal"];
const questions: Record<string, string> = {
 title: "Qual o nome do serviço?", description: "Qual descrição deve aparecer na nota?", nationalCode: "Qual o código nacional do serviço? Informe os 6 dígitos confirmados para sua atividade.", amount: "Qual o valor do serviço em reais?", issTaxation: "Qual a tributação do ISS? Responda 1 (tributável), 2 (imunidade), 3 (exportação) ou 4 (não incidência), conforme seu enquadramento confirmado.", withholding: "Qual a retenção do ISS? 1 (não retido), 2 (pelo tomador) ou 3 (pelo intermediário).", issRate: "Qual a alíquota do ISS (%)? Se não se aplica, responda dispensado. Não escolha uma alíquota sem confirmação fiscal.", estimatedFederal: "Qual o percentual aproximado dos tributos federais? Informe o valor confirmado (inclusive 0, se for o caso).", estimatedState: "Qual o percentual aproximado dos tributos estaduais?", estimatedMunicipal: "Qual o percentual aproximado dos tributos municipais?",
};
function normalize(value: string) { return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim(); }
function money(value: string) { const clean = value.replace(/r\$|\s/gi, ""); if (!/^\d+(?:[.,]\d{1,2})?$/.test(clean)) return NaN; return Number(clean.replace(",", ".")); }
export async function handleFiscalWhatsApp(user: User, mode: "personal" | "business", phone: string, message: string, action: PendingAction | null): Promise<boolean> {
 const pending = action?.type === "nfse_draft" && action.userId === user.id ? action : null, text = normalize(message);
 const requested = /\b(?:nota fiscal|notas fiscais|nfs[ -]?e)\b/.test(text) && /\b(?:emita|emitir|emite|tire|tirar|gerar|gere|preparar|prepare|consultar|consulte|listar|liste|ver|veja|envie|enviar|manda|mandar|pdf|servicos)\b/.test(text);
 if (!pending && !requested) return false;
 const say = async (value: string) => {
  if (await getPhoneAccess(user.id, phone) !== access) { await clearPendingAction(phone); return; }
  if (await sendText(phone, value, { privateFinancial: true }) === false) { await clearPendingAction(phone); throw Error("Não consegui enviar a pergunta. Peça a preparação novamente."); }
 };
 const access = await getPhoneAccess(user.id, phone);
 if (!access || (access !== "both" && access !== "business") || mode !== "business" || user.plan !== "business" || user.locale !== "pt-BR") { if (pending) await clearPendingAction(phone); if (access) await say("Notas fiscais usam o modo Empresa de uma conta brasileira. Este número precisa ter acesso empresarial."); return true; }
 if (pending && /^(cancelar|cancela|sair|deixa pra la)$/.test(text)) { await clearPendingAction(phone); await say("Cancelei a preparação. Nenhuma nota fiscal foi emitida."); return true; }
 try {
  const overview = await fiscalOverview(user.id);
  if (!overview.profile) { await say("Primeiro, salve o cadastro fiscal desta empresa na plataforma → Notas fiscais → Cadastro fiscal. Depois eu preparo sua nota por aqui. Não envie certificado ou senha pelo WhatsApp."); return true; }
  if (!pending && !/\b(?:emita|emitir|emite|tire|tirar|gerar|gere|preparar|prepare)\b/.test(text) && /\b(?:consultar|consulte|listar|liste|ver|veja|pdf|envie|enviar|manda|mandar)\b/.test(text)) { await say(overview.drafts.length ? `Rascunhos de *${overview.companyName}* (ainda não emitidos):\n\n${overview.drafts.slice(0, 10).map(item => `• ${item.draft.recipientName} — ${item.draft.service.title} — R$ ${item.draft.service.amount.toFixed(2)} — ${item.status === "draft" ? "rascunho" : item.status}`).join("\n")}\n\nA emissão e o PDF oficial aguardam homologação. Veja os detalhes em Notas fiscais.` : "Esta empresa ainda não tem notas emitidas. Posso preparar um rascunho: peça ‘prepare uma nota fiscal’."); return true; }
  const save = async (data: Omit<PendingFiscalDraft, "phone" | "expiresAt" | "type" | "userId">, question: string) => { await setPendingAction(phone, { type: "nfse_draft", userId: user.id, ...data }); await say(question); };
  if (!pending) { await save({ stage: "service" }, `Vou preparar um *rascunho* para ${overview.companyName}. A emissão ainda aguarda homologação.\n\nQual serviço?\n${overview.services.slice(0, 10).map((item, index) => `${index + 1}. ${item.service.title} — R$ ${item.service.amount.toFixed(2)}`).join("\n")}\n\nOs 10 primeiros aparecem acima; qualquer outro pode ser escolhido pelo nome exato. Responda o nome/número ou *novo serviço* para informar os dados na conversa.`); return true; }
  const { serviceId, newService, recipientName, recipientDocument, amount } = pending;
  const partial = { serviceId, newService, recipientName, recipientDocument, amount };
  if (pending.stage === "service") {
   if (/^novo(?: servico)?$/.test(text)) { await save({ stage: "new_service", newService: {}, newField: "title" }, questions.title); return true; }
   const selected = /^\d+$/.test(text) ? overview.services[Number(text) - 1] : overview.services.filter(item => normalize(item.service.title) === text).length === 1 ? overview.services.find(item => normalize(item.service.title) === text) : undefined;
   if (!selected) { await say("Escolha o número ou nome exato de um serviço, ou responda ‘novo serviço’."); return true; }
   await save({ stage: "recipient", serviceId: selected.id }, "Qual o nome ou razão social do tomador da nota?"); return true;
  }
  if (pending.stage === "new_service") {
   const field = pending.newField || "title", nextService = { ...newService };
   if (["amount", "issRate", "estimatedFederal", "estimatedState", "estimatedMunicipal"].includes(field)) {
    if (field === "issRate" && text === "dispensado") delete nextService.issRate;
    else { const value = money(message); if (!Number.isFinite(value)) { await say(questions[field]); return true; } nextService[field] = value; }
   } else nextService[field] = message.trim();
   validateFiscalServiceAnswer(field, nextService[field]);
   const next = fields[fields.indexOf(field) + 1];
   if (next) { await save({ stage: "new_service", newService: nextService, newField: next }, questions[next]); return true; }
   validateFiscalService(nextService);
   await save({ stage: "recipient", newService: nextService }, "Qual o nome ou razão social do tomador da nota?"); return true;
  }
  const service: FiscalService | undefined = newService ? validateFiscalService(newService) : overview.services.find(item => item.id === serviceId)?.service;
  if (!service) { await clearPendingAction(phone); await say("Esse serviço mudou ou foi arquivado. Peça a nota novamente para revisar os dados atuais."); return true; }
  if (pending.stage === "recipient") { if (!message.trim() || message.length > 150) { await say("Informe o nome/razão social do tomador (até 150 caracteres)."); return true; } await save({ ...partial, stage: "document", recipientName: message.trim() }, "Qual o CPF ou CNPJ do tomador? Informe só os números."); return true; }
  if (pending.stage === "document") { const document = message.replace(/\D/g, ""); if (!validFiscalDocument(document)) { await say("Confira os dígitos do CPF/CNPJ do tomador e envie novamente."); return true; } await save({ ...partial, stage: "amount", recipientDocument: document }, `Qual o valor? O padrão é R$ ${service.amount.toFixed(2)}. Responda *padrão* ou informe outro valor.`); return true; }
  if (pending.stage === "amount") { const value = text === "padrao" ? service.amount : money(message); if (!Number.isFinite(value) || value <= 0) { await say("Informe um valor positivo em reais, ou ‘padrão’."); return true; } validateFiscalServiceAnswer("amount", value); await save({ ...partial, stage: "competence", amount: value }, "Qual a data de competência do serviço? Responda hoje ou DD/MM/AAAA."); return true; }
  const date = message.match(/^(\d{2})\/(\d{2})\/(\d{4})$/), competence = text === "hoje" ? new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }) : date ? `${date[3]}-${date[2]}-${date[1]}` : message.trim();
  const draft = await createFiscalDraft(user.id, { service: { ...service, amount }, recipientName, recipientDocument, competence }, "whatsapp", phone);
  await clearPendingAction(phone);
  await say(`*Rascunho preparado — não emitido*\n\nEmpresa: ${draft.draft.issuer.legalName}\nTomador: ${draft.draft.recipientName}\nServiço: ${draft.draft.service.description}\nValor: R$ ${draft.draft.service.amount.toFixed(2)}\nCompetência: ${draft.draft.competence}\nTributos aproximados: federal ${draft.draft.service.estimatedFederal}%, estadual ${draft.draft.service.estimatedState}%, municipal ${draft.draft.service.estimatedMunicipal}%.\n\nConfira em Notas fiscais. A emissão e o envio do PDF oficial continuam bloqueados até validar o emissor e a homologação; nenhuma nota foi enviada ao governo.`);
 } catch (failure) { await say(failure instanceof Error ? failure.message : "Não consegui preparar a nota agora. Nenhuma nota foi emitida."); }
 return true;
}
