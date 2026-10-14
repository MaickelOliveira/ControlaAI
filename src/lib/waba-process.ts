import "server-only";
import {handleIncomingMessage} from "./message-handler";
import {sendText as wppSend} from "./whatsapp";
import {downloadMedia} from "./waba";
import {transcribeAudio} from "./ai-processor";
import {getUserIdByPhone} from "./wpp-phone-links";
import {beginWhatsAppActivity, type WhatsAppActivityLease} from "./whatsapp-activity";
import {googleWhatsAppProviderEnvelope} from "./google-whatsapp-message";
import {beginWabaDispatch, finishWabaMessage, type ClaimedWabaMessage, type StoredWabaMessage} from "./waba-inbox";
import {parseCreditPixAnswer} from "./credit-pix-question";

type Message = StoredWabaMessage & {
  text?: {body?: string}; image?: {id?: string;caption?: string};
  video?: {id?: string;caption?: string}; audio?: {id?: string};
  document?: {id?: string;caption?: string;filename?: string};
  button?: {text?: string}; interactive?: {button_reply?: {id?: string;title?: string}};
};

/** A database claim can be retried while preparing media. Once a customer
 * action may start, the receipt becomes ambiguous on failure and is retained
 * for review rather than automatically executing a financial command twice. */
export async function processWabaMessage(row: ClaimedWabaMessage): Promise<void> {
  const message = row.message as Message;
  const from = typeof message.from === "string" ? message.from.replace(/\D/g, "") : "";
  let activity: WhatsAppActivityLease | undefined;
  let dispatchStarted = false;
  try {
    if (message.id !== row.messageId || !/^\d{8,20}$/.test(from)) throw Error("WABA_INBOX_INVALID");
    activity = await beginWhatsAppActivity(from, "inbound");
    const envelope = googleWhatsAppProviderEnvelope("waba", row.messageId);
    const common = {...envelope, from, receivedAt: row.receivedAt, contactName: row.contactName};
    const dispatch = async () => {
      await beginWabaDispatch(row.messageId, row.leaseToken);
      dispatchStarted = true;
    };
    const reply = async (text: string) => {
      await dispatch();
      if (!await wppSend(from, text)) throw Error("WABA_REPLY_UNCONFIRMED");
    };

    if (message.type === "text" && message.text?.body?.trim()) {
      await dispatch();
      await handleIncomingMessage({...common, text: message.text.body.trim()});
    } else if (message.type === "interactive" && message.interactive?.button_reply?.title) {
      const button = message.interactive.button_reply;
      const title = button.title!;
      const creditPixAnswer = parseCreditPixAnswer(button.id || "");
      await dispatch();
      await handleIncomingMessage({...common, text: title, ...(creditPixAnswer ? {creditPixAnswer} : {})});
    } else if (message.type === "button" && message.button?.text) {
      await dispatch();
      await handleIncomingMessage({...common, text: message.button.text});
    } else if (message.type === "audio" && message.audio?.id) {
      const media = await downloadMedia(message.audio.id).catch(() => null);
      if (!media) await reply("🎤 Não consegui receber o áudio. Pode enviar novamente?");
      else {
        const userId = await getUserIdByPhone(from).catch(() => null);
        const transcript = await transcribeAudio(media.buffer, media.mimeType, userId || undefined).catch(() => null);
        if (!transcript) await reply("🎤 Não consegui entender o áudio. Pode digitar sua mensagem?");
        else { await dispatch(); await handleIncomingMessage({...common, text: transcript}); }
      }
    } else if (message.type === "image" || message.type === "video" || message.type === "document") {
      const field = message[message.type];
      if (field?.id) {
        const media = await downloadMedia(field.id).catch(() => null);
        if (!media) await reply("Não consegui receber o arquivo. Pode enviar novamente?");
        else {
          await dispatch();
          await handleIncomingMessage({
            ...common, text: "", isFileMessage: true, fileBuffer: media.buffer,
            fileMimeType: media.mimeType, fileCaption: field.caption,
            fileName: message.type === "document" ? message.document?.filename || `arquivo_${Date.now()}` : `arquivo_${Date.now()}`,
          });
        }
      }
    }
    await finishWabaMessage(row.messageId, row.leaseToken, "succeeded");
  } catch {
    try { await finishWabaMessage(row.messageId, row.leaseToken, dispatchStarted ? "failed" : "retry"); }
    catch { /* The durable lease remains for recovery or review. */ }
    console.error(dispatchStarted ? "[waba-inbox] Mensagem precisa de conferência" : "[waba-inbox] Preparação será tentada novamente");
  } finally {
    await activity?.finish().catch(() => {});
  }
}
