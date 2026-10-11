import { canonicalGroceryCategory, type GroceryPurchaseItem } from "./grocery";
export function validateGroceryPurchase(value: unknown) {
 if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("Compra inválida.");
 const input = value as Record<string, unknown>;
 const storeName = typeof input.storeName === "string" ? input.storeName.trim() : "";
 if (!storeName || storeName.length > 120) throw Error("Informe o nome do mercado, com até 120 caracteres.");
 const date = input.date || new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
 if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw Error("Informe uma data válida.");
 if (!Array.isArray(input.items) || !input.items.length || input.items.length > 200) throw Error("Informe de 1 a 200 produtos.");
 const items: GroceryPurchaseItem[] = input.items.map(value => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("Produto inválido.");
  const item = value as Record<string, unknown>;
  const productName = typeof item.productName === "string" ? item.productName.trim() : "";
  const unit = typeof item.unit === "string" ? item.unit.trim() : "un";
  if (!productName || productName.length > 160 || !unit || unit.length > 30) throw Error("Preencha o nome e a unidade de cada produto.");
  if (typeof item.price !== "number" || !Number.isFinite(item.price) || item.price < 0 || item.price > 1_000_000 || typeof item.quantity !== "number" || !Number.isFinite(item.quantity) || item.quantity <= 0 || item.quantity > 1_000_000) throw Error("Preencha preços e quantidades válidos em todos os produtos.");
  return { productName, unit, price: item.price, quantity: item.quantity, category: canonicalGroceryCategory(typeof item.category === "string" ? item.category : "Outros"), priceEstimated: item.priceEstimated === true };
 });
 const adjustment = input.adjustment ?? 0;
 if (typeof adjustment !== "number" || !Number.isFinite(adjustment)) throw Error("Desconto ou ajuste inválido.");
 const total = (items.reduce((sum, item) => sum + Math.round(item.price * item.quantity * 100), 0) + Math.round(adjustment * 100)) / 100;
 if (total <= 0 || total > 99_999_999) throw Error("O total pago deve ser maior que zero e inferior a R$ 100 milhões.");
 return { storeName, date, items, total };
}
