import { describe, expect, it } from "vitest";
import { isValidNewPassword, isValidResetCode } from "./password-reset";
describe("password reset validation", () => {
  it("aceita apenas seis dígitos", () => { expect(isValidResetCode("012345")).toBe(true); expect(isValidResetCode("12345")).toBe(false); expect(isValidResetCode("12a456")).toBe(false); });
  it("exige senha de 10 a 128 caracteres", () => { expect(isValidNewPassword("senha-forte-123")).toBe(true); expect(isValidNewPassword("curta123")).toBe(false); expect(isValidNewPassword("x".repeat(129))).toBe(false); });
});
