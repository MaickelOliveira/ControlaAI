import { describe, expect, it } from "vitest";
import { validateGroceryPurchase } from "./grocery-validation";
const purchase = { storeName: " Mercado ", date: "2026-10-11", items: [{ productName: " Arroz ", category: "Mercearia", price: 8.5, quantity: 1.5, unit: "kg" }] };
describe("validating a grocery purchase", () => {
 it("preserves fractional quantities and computes cents", () => {
  expect(validateGroceryPurchase(purchase)).toMatchObject({ storeName: "Mercado", total: 12.75, items: [{ productName: "Arroz", quantity: 1.5 }] });
 });
 it.each([NaN, Infinity, -1, 0])("rejects quantity %s without defaulting it to one", quantity => {
  expect(() => validateGroceryPurchase({ ...purchase, items: [{ ...purchase.items[0], quantity }] })).toThrow();
 });
 it.each(["2026-02-30", "invalid", "2026-13-01"])("rejects invalid date %s", date => {
  expect(() => validateGroceryPurchase({ ...purchase, date })).toThrow();
 });
 it("rejects an incomplete product rather than dropping it", () => {
  expect(() => validateGroceryPurchase({ ...purchase, items: [...purchase.items, { productName: "", price: 2, quantity: 1 }] })).toThrow();
 });
 it("preserves receipt discounts without replacing item prices", () => {
  const result = validateGroceryPurchase({ ...purchase, adjustment: -2.75 });
  expect(result.total).toBe(10); expect(result.items[0].price).toBe(8.5);
 });
 it.each([NaN, Infinity, -1, null])("rejects price %s", price => {
  expect(() => validateGroceryPurchase({ ...purchase, items: [{ ...purchase.items[0], price }] })).toThrow();
 });
 it("rejects a discount greater than the receipt", () => {
  expect(() => validateGroceryPurchase({ ...purchase, adjustment: -20 })).toThrow();
 });
 it("keeps estimated prices labelled and unknown categories as Outros", () => {
  expect(validateGroceryPurchase({ ...purchase, items: [{ ...purchase.items[0], category: "unknown", priceEstimated: true }] })).toMatchObject({ items: [{ category: "Outros", priceEstimated: true }] });
 });
});
