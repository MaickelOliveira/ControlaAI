import { getConfig } from "@/lib/whatsapp-config";
import * as evolution from "@/lib/evolution";
import * as waba from "@/lib/waba";
import { addMessage } from "@/lib/conversations";

/** Facade agnóstica de provider — dezenas de call-sites no bot (switch de
 *  intenções em message-handler.ts) usam só sendText/sendFile e não
 *  precisam saber se o provider ativo é Evolution ou WABA. Toda resposta
 *  enviada com sucesso é logada automaticamente no Inbox aqui, num único
 *  lugar, em vez de instrumentar cada call-site manualmente. */

/** Código de idioma que a Graph API espera no campo language.code do
 *  template — nunca confiar em "pt_BR" fixo depois que existe conta em
 *  outro idioma. */
function languageCodeFor(locale?: string): string {
  if (locale === "es") return "es";
  if (locale === "pt-PT") return "pt_PT";
  return "pt_BR";
}

/** Cada idioma precisa do PRÓPRIO template aprovado no Meta Business Manager
 *  (o texto de um template aprovado é fixo, não dá pra reaproveimar o mesmo
 *  nome com texto diferente por idioma) — convenção: sufixo "_es"/"_pt" no
 *  nome, pt-BR sem sufixo (é o que já está registrado hoje). Só funciona
 *  depois que a versão de cada idioma for registrada/aprovada no Meta —
 *  ver lista entregue ao final da Fase 1 de multi-idioma. */
function localizedTemplateName(base: string, locale?: string): string {
  if (locale === "es") return `${base}_es`;
  if (locale === "pt-PT") return `${base}_pt`;
  return base;
}

export async function sendText(to: string, message: string): Promise<boolean> {
  const provider = (await getConfig()).provider;
  const ok = provider === "waba" ? await waba.sendText(to, message) : await evolution.sendText(to, message);
  if (ok) await addMessage(to, { role: "assistant", content: message, ts: Date.now() });
  return ok;
}

/** Lembretes são sempre proativos (nunca respondem a uma mensagem do
 *  usuário), então quase sempre caem fora da janela de 24h — no WABA
 *  precisam ir como template aprovado, não texto livre. Evolution (API não
 *  oficial) não tem essa restrição, então continua mandando texto normal. */
export async function sendReminderTemplate(to: string, templateName: string, renderedText: string, params: Record<string, string>, locale?: string): Promise<boolean> {
  const provider = (await getConfig()).provider;
  let ok: boolean;
  if (provider === "waba") {
    const result = await waba.sendTemplate(to, localizedTemplateName(templateName, locale), languageCodeFor(locale), params);
    ok = result.ok;
    // wamid aqui é o único jeito de casar esse envio com o evento de status
    // (sent/delivered/read/failed) que chega depois, assíncrono, no webhook.
    if (ok) console.log(`[whatsapp] template ${templateName} aceito, msg=${result.messageId}`);
  } else {
    ok = await evolution.sendText(to, renderedText);
  }
  if (ok) await addMessage(to, { role: "assistant", content: renderedText, ts: Date.now() });
  return ok;
}

/** Boas-vindas de conta paga recém-criada (ver billing-webhooks.ts) — não
 *  manda o link de "criar senha" aqui (esse foi rejeitado pela Meta, provável
 *  padrão de phishing "clique pra criar sua senha" + link). O link já foi
 *  mandado por e-mail (sendFirstAccessLinkEmail em brevo.ts, mesmo gatilho);
 *  esta mensagem só avisa que ele está lá, com um contato de suporte de
 *  fallback. Corpo 100% estático — sem variável nenhuma — pra reduzir risco
 *  de rejeição de novo. */
export async function sendWelcomeTemplate(to: string, locale?: string): Promise<boolean> {
  const provider = (await getConfig()).provider;
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
    es:
      "¡Hola! 👋 Soy Zelo, tu asistente financiero y de tareas directo por WhatsApp.\n\n" +
      "Tu pago fue confirmado y tu cuenta ya está lista.\n\n" +
      "El link para crear tu contraseña de acceso está en el correo que te enviamos ahora — solo abre tu bandeja de entrada.\n\n" +
      "Para configurar WhatsApp con la inteligencia artificial de Zelo, solo entra a zelogestaointeligente.com.br, ve a Configuración y sigue los pasos simples.\n\n" +
      "¿No encontraste el correo? Escríbenos a contato@zelogestaointeligente.com.br que te ayudamos.",
  };
  const renderedText = texts[locale ?? "pt-BR"] ?? texts["pt-BR"];
  let ok: boolean;
  if (provider === "waba") {
    const templateName = localizedTemplateName("boas_vindas_cadastro2", locale);
    const result = await waba.sendTemplate(to, templateName, languageCodeFor(locale), {});
    ok = result.ok;
    if (ok) console.log(`[whatsapp] template ${templateName} aceito, msg=${result.messageId}`);
  } else {
    ok = await evolution.sendText(to, renderedText);
  }
  if (ok) await addMessage(to, { role: "assistant", content: renderedText, ts: Date.now() });
  return ok;
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
