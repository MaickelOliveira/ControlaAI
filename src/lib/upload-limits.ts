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

const ALLOWED_UPLOADS: Record<string, readonly string[]> = {
  ".pdf": ["application/pdf"],
  ".jpg": ["image/jpeg"],
  ".jpeg": ["image/jpeg"],
  ".png": ["image/png"],
  ".webp": ["image/webp"],
  ".heic": ["image/heic", "image/heif", "application/octet-stream"],
  ".heif": ["image/heif", "image/heic", "application/octet-stream"],
  ".doc": ["application/msword"],
  ".docx": ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ".xls": ["application/vnd.ms-excel"],
  ".xlsx": ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  ".csv": ["text/csv", "application/csv", "application/vnd.ms-excel"],
  ".txt": ["text/plain"],
  ".mp4": ["video/mp4"],
  ".webm": ["video/webm"],
  ".mov": ["video/quicktime"],
};

/** Content-Type vem do cliente e não é prova do conteúdo, mas cruzá-lo com
 * uma allowlist de extensões impede formatos executáveis/HTML/SVG e elimina
 * os casos perigosos mais comuns. O download forçado fornece a segunda
 * camada de proteção. */
export function validateUploadType(name: string, mimeType: string): boolean {
  const dot = name.lastIndexOf(".");
  if (dot < 0) return false;
  const extension = name.slice(dot).toLowerCase();
  const allowedMimes = ALLOWED_UPLOADS[extension];
  return !!allowedMimes?.includes((mimeType || "application/octet-stream").toLowerCase());
}
