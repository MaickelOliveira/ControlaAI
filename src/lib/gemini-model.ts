/**
 * Modelo Gemini usado em toda a Zelo (classificador, leitura de documentos,
 * áudio, imagem, pesquisa e Drive).
 *
 * O gemini-2.5-flash foi descontinuado: a partir de 01/12/2026 o Google
 * redireciona as chamadas a ele para o gemini-3.5-flash-lite. O 3.8 Flash é
 * o Flash mais capaz disponível em nov/2026.
 *
 * ZELO_GEMINI_MODEL troca o modelo de todo o sistema sem novo deploy (basta
 * reiniciar a aplicação), por exemplo para voltar atrás se algo piorar.
 */
export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";

export function geminiModel(): string {
  return process.env.ZELO_GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
}
