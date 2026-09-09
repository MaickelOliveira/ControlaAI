import { describe, it, expect } from "vitest";
import { listNumberLabel, parseLinkedPhoneAccess, phoneMatches, replyPhoneNotLinked, replyProcessingError, splitWhatsAppMessage } from "./message-handler";
import { parseFinanceDestinationMode } from "./finances";
import { parseFinanceChoiceMulti, parseFinancePatchFromText } from "./pending-actions";
import { replyHelp } from "./bot-replies";

describe("phoneMatches", () => {
  it("matches identical numbers", () => {
    expect(phoneMatches("5511987654321", "5511987654321")).toBe(true);
  });

  it("matches with/without country code (55)", () => {
    expect(phoneMatches("5511987654321", "11987654321")).toBe(true);
    expect(phoneMatches("11987654321", "5511987654321")).toBe(true);
  });

  it("matches with/without formatting characters", () => {
    expect(phoneMatches("+55 (11) 98765-4321", "5511987654321")).toBe(true);
  });

  it("does not match different numbers", () => {
    expect(phoneMatches("5511987654321", "5511912345678")).toBe(false);
  });

  it("does not match unrelated short numbers", () => {
    expect(phoneMatches("1234", "5678")).toBe(false);
  });

  it("does not confuse an international number with a Brazilian number sharing its suffix", () => {
    expect(phoneMatches("34612345678", "5534612345678")).toBe(false);
  });

  it("returns false for empty input", () => {
    expect(phoneMatches("", "5511987654321")).toBe(false);
    expect(phoneMatches("5511987654321", "")).toBe(false);
  });
});

describe("parseLinkedPhoneAccess", () => {
  it.each([
    ["personal", "personal"],
    ["solo personal", "personal"],
    ["empresarial", "business"],
    ["empresa", "business"],
    ["los dos", "both"],
    ["ambos", "both"],
    ["3", "both"],
  ])("understands Spanish access answer %s", (answer, expected) => {
    expect(parseLinkedPhoneAccess(answer)).toBe(expected);
  });
});

describe("finance mode changes", () => {
  it.each([
    ["mudar para conta da empresa", "business"],
    ["conta empresarial", "business"],
    ["mudar da conta da empresa para pessoal", "personal"],
    ["pasar a la cuenta de la empresa", "business"],
    ["cuenta personal", "personal"],
  ] as const)("parses %s as %s", (message, expected) => {
    expect(parseFinanceDestinationMode(message)).toBe(expected);
    expect(parseFinancePatchFromText(message)).toMatchObject({ mode: expected });
  });

  it("keeps both selected item numbers when the user also repeats the date", () => {
    const candidates = [1, 2, 3].map(index => ({
      id: String(index), description: `Conta ${index}`, amount: index * 10,
      date: "2026-09-07", category: "Moradia", mode: "personal",
    }));
    expect(parseFinanceChoiceMulti("2 e 3 do dia 07/09/2026", candidates)).toEqual([1, 2]);
  });
});

describe("unlinked phone language", () => {
  it("sends only Portuguese to a Brazilian number", () => {
    const reply = replyPhoneNotLinked("+55 (88) 82316-735");
    expect(reply).toContain("Olá!");
    expect(reply).not.toMatch(/¡Hola|Soy Zelo|Español/);
  });

  it("sends only Spanish to Spanish-speaking country numbers", () => {
    const reply = replyPhoneNotLinked("+52 55 1234 5678");
    expect(reply).toContain("¡Hola!");
    expect(reply).not.toMatch(/Sou o Zelo|Português/);
  });
});

describe("WhatsApp list numbering", () => {
  it("uses keycap icons only through 9 and plain numbers from 10 onward", () => {
    expect(listNumberLabel(0)).toBe("1️⃣");
    expect(listNumberLabel(8)).toBe("9️⃣");
    expect(listNumberLabel(9)).toBe("10.");
    expect(listNumberLabel(12)).toBe("13.");
  });
});

describe("localized WhatsApp help and errors", () => {
  it("splits the complete Spanish help into messages accepted by WhatsApp", () => {
    const chunks = splitWhatsAppMessage(replyHelp("es"));
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every(chunk => chunk.length <= 3500)).toBe(true);
    expect(chunks.join("\n")).toContain("Zelo — tu asesor personal");
  });

  it("never returns the Portuguese processing error to a Spanish account", () => {
    const reply = replyProcessingError("es");
    expect(reply).toContain("Tuve un problema");
    expect(reply).not.toMatch(/Pode mandar|registrado do jeito certo|me avise/);
  });
});
