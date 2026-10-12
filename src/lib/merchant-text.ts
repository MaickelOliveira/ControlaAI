export function normalizeMerchantText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

/** Card descriptions commonly separate a merchant's words with * or other punctuation. */
export function merchantDescriptionMatchesTerms(description: string, terms: readonly string[]): boolean {
  const text = normalizeMerchantText(description);
  return terms.some(term => { const target = normalizeMerchantText(term); return !!target && text.includes(target); });
}
