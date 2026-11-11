/** Recognize only descriptions that unambiguously refer to a credit-card bill settlement. */
export function isBankBillPaymentDescription(description: string): boolean {
  const text = description.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return text === "pagamento de fatura"
    || /^pagto fatura master(?: ?card)?(?: \d+\b|$)/.test(text)
    || /^pagamento (?:da |de )?fatura (?:do |de )?cartao\b/.test(text)
    || /^deb(?:ito)? aut(?:om)? (?:de )?fat(?:ura)? cartao\b/.test(text)
    || /^deb(?:ito)? aut(?:om)? de fatura em c c\b/.test(text);
}
