import { getConfig } from "@/lib/whatsapp-config";
import * as evolution from "@/lib/evolution";
import * as waba from "@/lib/waba";
import { addMessage, hasOpenCustomerServiceWindow } from "@/lib/conversations";

/** Facade agnóstica de provider — dezenas de call-sites no bot (switch de
 *  intenções em message-handler.ts) usam só sendText/sendFile e não
 *  precisam saber se o provider ativo é Evolution ou WABA. Toda resposta
 *  enviada com sucesso é logada automaticamente no Inbox aqui, num único
 *  lugar, em vez de instrumentar cada call-site manualmente. */

/** Código de idioma que a Graph API espera no campo language.code do
 *  template — nunca confiar em "pt_BR" fixo depois que existe conta em
 *  outro idioma. */
type TemplateLocale = "pt-BR" | "pt-PT" | "es";

function validatedTemplateLocale(locale?: string): TemplateLocale {
  if (locale === undefined || locale === "pt-BR") return "pt-BR";
  if (locale === "pt-PT" || locale === "es") return locale;
  throw new Error(`[whatsapp] locale de template não suportado: ${locale}`);
}

export function languageCodeFor(locale?: string): string {
  const validatedLocale = validatedTemplateLocale(locale);
  if (validatedLocale === "es") return "es";
  if (validatedLocale === "pt-PT") return "pt_PT";
  return "pt_BR";
}

function defaultCountryIsoFor(locale?: string): string | undefined {
  const validatedLocale = validatedTemplateLocale(locale);
  if (validatedLocale === "pt-BR") return "BR";
  if (validatedLocale === "pt-PT") return "PT";
  // Espanhol atende vários países. O número deve chegar normalizado pelo
  // checkout ou já conter seu próprio DDI; nunca presumir Espanha (+34).
  return undefined;
}

/** Nomes espanhóis são deliberadamente diferentes dos modelos brasileiros
 * já cadastrados — não são simples sufixos "_es". O mapa precisa coincidir
 * exatamente com o nome aprovado no Meta Business Manager. */
export const SPANISH_TEMPLATE_NAMES = {
  lembrete_assessor: "aviso_programado_por_contacto",
  lbte_empresarial: "informacion_programada_cuenta",
  lbt_pessoal: "nota_personal_pendiente",
  cbr_recorrente: "movimiento_financiero_del_dia",
  lembrete_compromisso: "agenda_evento_proximo",
  lembrete_compromisso15: "agenda_evento_en_breve",
  boas_vindas_cadastro2: "acceso_confirmado_zelo",
} as const;

export type WhatsAppTemplateBase = keyof typeof SPANISH_TEMPLATE_NAMES;

const SPANISH_PARAM_NAMES: Record<WhatsAppTemplateBase, Record<string, string>> = {
  lembrete_assessor: { remetente: "remitente", lembrete: "aviso" },
  lbte_empresarial: { lembrete: "detalle" },
  lbt_pessoal: { texto: "aviso" },
  cbr_recorrente: { descricao: "concepto", valor: "importe", data: "fecha" },
  lembrete_compromisso: { compromisso: "evento", horario: "hora" },
  lembrete_compromisso15: { compromisso: "evento", horario: "hora" },
  boas_vindas_cadastro2: {},
};

const TEMPLATE_PARAM_KEYS: Record<WhatsAppTemplateBase, readonly string[]> = {
  lembrete_assessor: ["remetente", "lembrete"],
  lbte_empresarial: ["lembrete"],
  lbt_pessoal: ["texto"],
  cbr_recorrente: ["descricao", "valor", "data"],
  lembrete_compromisso: ["compromisso", "horario"],
  lembrete_compromisso15: ["compromisso", "horario"],
  boas_vindas_cadastro2: [],
};

/** Corpo que deve ser cadastrado exatamente no Meta para o template
 * informacion_programada_cuenta. A variável nomeada {{detalle}} também
 * precisa coincidir com o nome enviado pela Graph API. */
export const SPANISH_BUSINESS_REMINDER_TEMPLATE_BODY =
  "📌 Información de tu cuenta Zelo\n\n" +
  "Tienes esta actividad programada:\n\n" +
  "{{detalle}}\n\n" +
  "La notificación fue configurada desde tu cuenta.";

export function renderSpanishBusinessReminder(detail: string): string {
  return SPANISH_BUSINESS_REMINDER_TEMPLATE_BODY.replace("{{detalle}}", detail);
}

export function localizedTemplateName(base: WhatsAppTemplateBase, locale?: string): string {
  const validatedLocale = validatedTemplateLocale(locale);
  if (validatedLocale === "es") {
    const spanishName = SPANISH_TEMPLATE_NAMES[base];
    if (!spanishName) {
      throw new Error(`[whatsapp] template espanhol não mapeado: ${base}`);
    }
    return spanishName;
  }
  if (validatedLocale === "pt-PT") return `${base}_pt`;
  return base;
}

export function localizedTemplateParams(base: WhatsAppTemplateBase, params: Record<string, string>, locale?: string): Record<string, string> {
  const received = Object.keys(params).sort();
  const expected = [...TEMPLATE_PARAM_KEYS[base]].sort();
  if (received.length !== expected.length || received.some((key, index) => key !== expected[index])) {
    throw new Error(`[whatsapp] parâmetros inválidos para ${base}: esperado ${expected.join(",") || "nenhum"}`);
  }
  if (validatedTemplateLocale(locale) !== "es") return params;
  const names = SPANISH_PARAM_NAMES[base];
  if (!names) {
    throw new Error(`[whatsapp] parâmetros de template espanhol não mapeados: ${base}`);
  }
  return Object.fromEntries(Object.entries(params).map(([key, value]) => {
    const spanishKey = names[key];
    if (!spanishKey) {
      throw new Error(`[whatsapp] parâmetro espanhol não mapeado: ${base}.${key}`);
    }
    return [spanishKey, value];
  }));
}

export async function sendText(to: string, message: string): Promise<boolean> {
  const provider = (await getConfig()).provider;
  const ok = provider === "waba" ? await waba.sendText(to, message) : await evolution.sendText(to, message);
  if (ok) await addMessage(to, { role: "assistant", content: message, ts: Date.now() });
  return ok;
}

/** Lembretes são proativos, mas podem cair dentro de uma janela de atendimento
 * aberta por uma mensagem recente do cliente. Dentro das 24h usamos o texto
 * completo da Zelo; fora delas usamos obrigatoriamente o template aprovado. */
export type ReminderTemplateDispatch = {
  templateName: "lembrete_assessor" | "lbte_empresarial" | "lbt_pessoal";
  renderedText: string;
  params: Record<string, string>;
};

/** Decide de forma única qual template de lembrete usar. O cron interno e o
 * endpoint de cron compartilham esta função para não divergirem em idioma,
 * variáveis ou finalidade do disparo. */
export function buildReminderTemplateDispatch(input: {
  message: string;
  recipientType: string;
  mode: "personal" | "business";
  ownerName?: string;
  locale?: string;
}): ReminderTemplateDispatch {
  const { message, recipientType, mode, ownerName, locale } = input;
  if (recipientType !== "self") {
    const sender = ownerName || (locale === "es" ? "alguien" : "alguém");
    return {
      templateName: "lembrete_assessor",
      renderedText: locale === "es"
        ? `🔔 Aviso programado por ${sender}\n\n${message}\n\nEste aviso fue solicitado previamente en Zelo.`
        : locale === "pt-PT"
          ? `🔔 Lembrete de ${sender}: ${message} — Zelo Assessor`
          : `🔔 Lembrete de ${sender}: ${message} — Zelo Assessor`,
      params: { remetente: sender, lembrete: message },
    };
  }
  if (mode === "business") {
    return {
      templateName: "lbte_empresarial",
      renderedText: locale === "es"
        ? renderSpanishBusinessReminder(message)
        : locale === "pt-PT"
          ? `🔔 Zelo — Lembrete empresarial configurado\n\nA tua empresa precisa: ${message}\n\nLembrete empresarial agendado no Zelo.`
          : `🔔 Zelo — Lembrete empresarial configurado\n\nSua empresa precisa: ${message}\n\nLembrete empresarial agendado no Zelo.`,
      params: { lembrete: message },
    };
  }
  return {
    templateName: "lbt_pessoal",
    renderedText: locale === "es"
      ? `🔔 Aviso personal\n\n${message}\n\nEste aviso fue programado previamente en Zelo.`
      : locale === "pt-PT"
        ? `🔔 Zelo — Lembrete que configuraste\n\nPrecisas de: ${message}\n\nLembrete pessoal agendado por ti no Zelo.`
        : `🔔 Zelo — Lembrete que você configurou\n\nVocê precisa: ${message}\n\nLembrete pessoal agendado por você no Zelo.`,
    params: { texto: message },
  };
}

export async function sendReminderTemplate(to: string, templateName: WhatsAppTemplateBase, renderedText: string, params: Record<string, string>, locale?: string): Promise<boolean> {
  const provider = (await getConfig()).provider;
  let ok: boolean;
  if (provider === "waba") {
    const localizedName = localizedTemplateName(templateName, locale);
    const localizedParams = localizedTemplateParams(templateName, params, locale);
    const countryIso = defaultCountryIsoFor(locale);
    const windowOpen = await hasOpenCustomerServiceWindow(to);

    if (windowOpen) {
      ok = await waba.sendText(to, renderedText, countryIso);
      if (ok) console.log(`[whatsapp] texto livre enviado dentro da janela de 24h (${localizedName})`);
    } else {
      ok = false;
    }

    // A janela pode vencer entre a consulta e o envio. Se o texto livre for
    // rejeitado, tenta imediatamente o template, que também é a única opção
    // quando não existe mensagem recebida nas últimas 24 horas.
    if (!ok) {
      const result = await waba.sendTemplate(
        to,
        localizedName,
        languageCodeFor(locale),
        localizedParams,
        countryIso,
      );
      ok = result.ok;
      // wamid aqui é o único jeito de casar esse envio com o evento de status
      // (sent/delivered/read/failed) que chega depois, assíncrono, no webhook.
      if (ok) console.log(`[whatsapp] template ${localizedName} aceito, msg=${result.messageId}`);
    }
  } else {
    ok = await evolution.sendText(to, renderedText, defaultCountryIsoFor(locale));
  }
  if (ok) await addMessage(to, { role: "assistant", content: renderedText, ts: Date.now() });
  return ok;
}

/** Boas-vindas de conta paga recém-criada (ver billing-webhooks.ts) — não
 *  manda o link de "criar senha" aqui (esse foi rejeitado pela Meta, provável
 *  padrão de phishing "clique pra criar sua senha" + link). O link já foi
 *  mandado por e-mail (sendFirstAccessLinkEmail em brevo.ts, mesmo gatilho);
 *  esta mensagem avisa que ele está lá e orienta como conectar o WhatsApp,
 *  com um contato de suporte de fallback. Corpo 100% estático — sem variável
 *  nenhuma — pra reduzir risco de rejeição de novo. */
export const SPANISH_WELCOME_TEMPLATE_TEXT =
  "¡Hola! Tu pago fue confirmado y tu cuenta de Zelo ya está activa.\n\n" +
  "Las instrucciones para crear tu contraseña fueron enviadas a tu correo electrónico.\n\n" +
  "Para conectar tu WhatsApp con la inteligencia artificial de Zelo, entra en zelogestaointeligente.com.br/es, inicia sesión, abre Configuración y sigue las instrucciones de la sección WhatsApp.\n\n" +
  "Si no encuentras el correo o necesitas ayuda, escribe a contato@zelogestaointeligente.com.br.";

export async function sendWelcomeTemplate(to: string, locale?: string): Promise<boolean> {
  const texts: Record<string, string> = {
    "pt-BR":
      "Oi! 👋 Sou o Zelo, seu assistente financeiro e de tarefas direto no WhatsApp.\n\n" +
      "Seu pagamento foi confirmado e sua conta já está pronta.\n\n" +
      "O link para você criar sua senha de acesso está no e-mail que te enviamos agora — é só abrir a caixa de entrada.\n\n" +
      "Pra configurar o WhatsApp com a inteligência artificial da Zelo, é só entrar em zelogestaointeligente.com.br, acessar Configurações e seguir o passo a passo simples.\n\n" +
      "Não achou o e-mail? Manda uma mensagem pra contato@zelogestaointeligente.com.br que a gente te ajuda.",
    "pt-PT":
      "Olá! 👋 Sou o Zelo, o teu assistente financeiro e de tarefas diretamente no WhatsApp.\n\n" +
      "O teu pagamento foi confirmado e a tua conta já está pronta.\n\n" +
      "O link para criares a tua senha de acesso está no e-mail que te enviámos agora — é só abrir a caixa de entrada.\n\n" +
      "Para configurares o WhatsApp com a inteligência artificial da Zelo, é só entrar em zelogestaointeligente.com.br, aceder a Configurações e seguir o passo a passo simples.\n\n" +
      "Não encontraste o e-mail? Envia uma mensagem para contato@zelogestaointeligente.com.br que nós ajudamos-te.",
    es: SPANISH_WELCOME_TEMPLATE_TEXT,
  };
  const renderedText = texts[locale ?? "pt-BR"] ?? texts["pt-BR"];
  return sendReminderTemplate(to, "boas_vindas_cadastro2", renderedText, {}, locale);
}

export async function sendFile(to: string, fileBuffer: Buffer, filename: string, mimeType: string, caption?: string): Promise<boolean> {
  const provider = (await getConfig()).provider;
  const ok = provider === "waba"
    ? await waba.sendFile(to, fileBuffer, filename, mimeType, caption)
    : await evolution.sendFile(to, fileBuffer, filename, mimeType, caption);
  if (ok) {
    const label = mimeType.startsWith("image/") ? "📷 Imagem" : mimeType.startsWith("audio/") ? "🎵 Áudio" : `📎 ${filename}`;
    await addMessage(to, { role: "assistant", content: caption ? `${label}\n${caption}` : label, ts: Date.now() });
  }
  return ok;
}

export async function checkConnection(): Promise<"CONNECTED" | "DISCONNECTED" | "QRCODE" | "UNKNOWN"> {
  const provider = (await getConfig()).provider;
  return provider === "waba" ? await waba.checkConnection() : await evolution.checkConnectionStatus();
}

/** Só Evolution usa QR — WABA não tem sessão pra escanear. */
export async function getQrCode(): Promise<string | null> {
  const provider = (await getConfig()).provider;
  if (provider === "waba") return null;
  return evolution.getQrCode();
}

export async function isConfigured(): Promise<boolean> {
  const provider = (await getConfig()).provider;
  return provider === "waba" ? waba.isWabaConfigured() : evolution.isEvolutionConfigured();
}
