/** Sem limite nenhum, um upload (Drive ou importação de fatura) era lido
 *  inteiro pra memória (`arrayBuffer()`) e gravado em disco sem nenhuma
 *  checagem de tamanho — um arquivo enorme (de propósito ou não) podia
 *  esgotar memória/disco do servidor. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25MB — folga confortável acima de fatura/comprovante típico

export function tooLarge(size: number): boolean {
  return size > MAX_UPLOAD_BYTES;
}

/** Checa o Content-Length ANTES de ler o corpo — rejeita cedo, sem
 *  bufferizar o upload inteiro na memória só pra descobrir depois que
 *  passou do limite. */
export function contentLengthTooLarge(req: Request): boolean {
  const len = Number(req.headers.get("content-length") || 0);
  return len > 0 && len > MAX_UPLOAD_BYTES;
}
