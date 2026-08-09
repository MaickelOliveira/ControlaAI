import { getSupabase } from "./supabase";

/** Guarda de deduplicação de mensagens de webhook (WABA) — antes um Set em
 *  memória (resetava a cada restart) depois um arquivo local (não
 *  coordenava entre múltiplas instâncias reais). Insert direto na tabela é
 *  atômico por natureza (chave primária) — se já existir, o insert falha
 *  com conflito e sabemos que já foi processado, sem precisar de
 *  leitura+escrita separadas. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // folga confortável acima de qualquer janela de retentativa da Meta

export async function alreadyProcessed(id: string | undefined): Promise<boolean> {
  if (!id) return false;
  const { error } = await getSupabase().from("webhook_message_ids").insert({ message_id: id });
  if (!error) {
    // limpeza oportunista de entradas velhas — não precisa ser exata nem bloquear o retorno
    getSupabase().from("webhook_message_ids").delete().lt("processed_at", new Date(Date.now() - MAX_AGE_MS).toISOString()).then(() => {});
    return false;
  }
  // código 23505 = violação de chave única (já existe) — qualquer outro erro trata como "não processado" pra não bloquear mensagem por falha transitória
  return error.code === "23505";
}
