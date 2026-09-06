import { describe, expect, it } from "vitest";
import { canonicalGroceryCategory, findLatestPurchaseByStoreName, type GroceryPurchase } from "./grocery";

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

describe("findLatestPurchaseByStoreName", () => {
  const purchase = (id: string, storeName: string, date: string): GroceryPurchase => ({
    id, userId: "user-1", storeId: `store-${id}`, storeName, date, total: 100,
    items: [], source: "web", createdAt: `${date}T12:00:00.000Z`,
  });

  it("returns the latest purchase and tolerates a small typo in the store name", () => {
    const purchases = [
      purchase("1", "Super Muffato", "2026-08-20"),
      purchase("2", "Super Muffato", "2026-09-05"),
      purchase("3", "Assaí", "2026-09-06"),
    ];

    expect(findLatestPurchaseByStoreName(purchases, "Muffatto")?.id).toBe("2");
    expect(findLatestPurchaseByStoreName(purchases, "Assai")?.id).toBe("3");
    expect(findLatestPurchaseByStoreName(purchases, "Mercado inexistente")).toBeNull();
  });
});
