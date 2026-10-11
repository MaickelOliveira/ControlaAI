/** Bound bytes as they arrive; Content-Length alone does not protect streamed bodies. */
export async function boundedFiscalRequest(request: Request, limit: number): Promise<Request> {
  const declared = request.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > limit)) throw Error("Dados fiscais excedem o tamanho permitido.");
  if (!request.body) throw Error("Dados fiscais inválidos.");
  const reader = request.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) { await reader.cancel(); throw Error("Dados fiscais excedem o tamanho permitido."); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return new Request(request.url, { method: request.method, headers: request.headers, body: bytes });
}
