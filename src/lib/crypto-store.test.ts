import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => {
  process.env.DATA_ENCRYPTION_KEY = "test-key-only-used-in-unit-tests";
});

describe("crypto-store", () => {
  it("round-trips a value through encrypt/decrypt", async () => {
    const { encryptField, decryptField } = await import("./crypto-store");
    const plain = "meu-segredo-super-secreto";
    const encrypted = encryptField(plain);
    expect(encrypted).toBeDefined();
    expect(encrypted).not.toBe(plain);
    expect(encrypted?.startsWith("enc:")).toBe(true);
    expect(decryptField(encrypted)).toBe(plain);
  });

  it("passes through undefined unchanged", async () => {
    const { encryptField, decryptField } = await import("./crypto-store");
    expect(encryptField(undefined)).toBeUndefined();
    expect(decryptField(undefined)).toBeUndefined();
  });

  it("treats legacy plaintext (no enc: prefix) as already-decrypted", async () => {
    const { decryptField } = await import("./crypto-store");
    expect(decryptField("valor-antigo-em-texto-puro")).toBe("valor-antigo-em-texto-puro");
  });

  it("produces different ciphertext for the same plaintext each time (random IV)", async () => {
    const { encryptField } = await import("./crypto-store");
    const a = encryptField("mesmo-valor");
    const b = encryptField("mesmo-valor");
    expect(a).not.toBe(b);
  });
});
