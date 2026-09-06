import { describe, expect, it } from "vitest";
import { canonicalGroceryCategory } from "./grocery";

describe("canonicalGroceryCategory", () => {
  it("keeps one storage category across Portuguese and Spanish pages", () => {
    expect(canonicalGroceryCategory("Mercearia")).toBe("Mercearia");
    expect(canonicalGroceryCategory("Abarrotes")).toBe("Mercearia");
    expect(canonicalGroceryCategory("Frutas e Legumes")).toBe("Hortifruti");
    expect(canonicalGroceryCategory("Frutas y Verduras")).toBe("Hortifruti");
    expect(canonicalGroceryCategory("Lácteos")).toBe("Laticínios");
    expect(canonicalGroceryCategory("Limpieza")).toBe("Limpeza");
  });
});
