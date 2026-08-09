import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";

/** Criptografa campos sensíveis (tokens OAuth, access tokens de API, admin
 *  keys) antes de gravar nos JSONs em disco — hoje eles ficavam em texto
 *  puro, legíveis por qualquer processo/backup/dump que tenha acesso ao
 *  arquivo. AES-256-GCM com chave derivada de DATA_ENCRYPTION_KEY (nunca um
 *  valor padrão — mesma postura de JWT_SECRET). */
function getKey(): Buffer {
  const secret = process.env.DATA_ENCRYPTION_KEY;
  if (!secret) throw new Error("DATA_ENCRYPTION_KEY não configurado — defina essa variável de ambiente antes de iniciar o servidor.");
  return createHash("sha256").update(secret).digest();
}

const PREFIX = "enc:";

export function encryptField(plain: string | undefined): string | undefined {
  if (!plain) return plain;
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

// Valores legados sem o prefixo (gravados em texto puro antes dessa
// mudança) continuam legíveis — voltam criptografados no próximo save.
export function decryptField(value: string | undefined): string | undefined {
  if (!value || !value.startsWith(PREFIX)) return value;
  const key = getKey();
  const raw = Buffer.from(value.slice(PREFIX.length), "base64");
  const iv = raw.subarray(0, 12);
  const authTag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
