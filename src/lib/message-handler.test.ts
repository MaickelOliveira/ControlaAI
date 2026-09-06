import { describe, it, expect } from "vitest";
import { parseLinkedPhoneAccess, phoneMatches } from "./message-handler";

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
