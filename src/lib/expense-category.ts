import { normalizeMerchantText as normalize } from "./merchant-text";
import type { AIResult, FinanceData } from "./ai-processor";
const rules: Array<[RegExp, string]> = [
  [/\b(?:iof|juros\s+(?:bancarios|do\s+(?:cartao|emprestimo|financiamento)|de\s+mora|mora|rotativo|sobre\s+(?:saldo|emprestimo|financiamento))|encargos\s+(?:bancarios|financeiros)|tarifa\s+(?:bancaria|do\s+banco)|anuidade\s+(?:do\s+cartao|diferenciada|cartao))\b|^juros$/, "Encargos bancários"],
  [/\b(?:emprestimos?|consignado|credito\s+(?:pessoal|facil\s+mobi))\b/, "Empréstimos"],
  [/\b(?:mensalidade\s+escolar|faculdade|universidade|curso|alura|udemy|coursera)\b/, "Educação"],
  [/\b(?:chat\s*gpt|open\s*ai|anthropic|google\s*gemini|perplexity)\b|^claude(?:\s+(?:ai|pro|sub))?$|\b(?:assinatura|subscription)\s+(?:do\s+)?claude\b/, "Inteligência Artificial"],
  [/\b(?:google\s*ads|google\s*adwords|facebook(?:\s+servicos\s+online|\s+ads)?|facebk|meta\s+ads|anuncios|publicidade|trafego\s+pago)\b/, "Marketing"],
  [/\b(?:delivery|zedelivery|ze\s+delivery|ifood|rappi|uber\s*eats|supermercado|mercearia|restaurante|padaria|refeicao|lanchonete|muffato|assai|atacadao|carrefour|pao\s+de\s+acucar|mercado(?!\s+(?:pago|livre)))\b/, "Alimentação"],
  [/\b(?:google\s*(?:cloud|workspace|one|drive|gsuite)|aws|amazon\s+web\s+services|microsoft\s*(?:365|azure)|adobe|canva)\b/, "Tecnologia"],
  [/\b(?:netflix|spotify|cinema|youtube\s*(?:premium|music)|disney\s*plus|prime\s*video|hbo\s*max)\b/, "Lazer"],
  [/\bgoogle\b(?!\s*(?:pay|pays|pagamentos))/, "Serviços"],
  [/\b(?:uber|99app|combustivel|gasolina|etanol|estacionamento|pedagio|posto\s+(?:de\s+)?combustivel)\b/, "Transporte"],
  [/\b(?:farmacia|drogaria|drogasil|droga\s*raia|drogaria\s*pacheco|hospital|dentista|clinica\s+medica)\b/, "Saúde"],
  [/\b(?:renner|riachuelo|vestuario|roupas|calcados)\b/, "Vestuário"],
  [/\b(?:darf|das\s+mei|iptu|ipva|tributo|imposto)\b/, "Impostos"],
  [/\b(?:aluguel|condominio|energia\s+eletrica|conta\s+de\s+agua|saneamento)\b/, "Moradia"],
  [/\b(?:internet|telefonia|assinatura\s+cloud)\b/, "Serviços"],
];

/** Specific merchant/purpose evidence can correct coarse bank/model suggestions. */
export function descriptionExpenseCategory(description: string): string | null {
  const text = normalize(description).replace(/\bsem juros\b/g, " ");
  // Marketplace/payment brands alone do not identify what was purchased.
  if (/\b(?:facebook\s*marketplace|meta\s*pay)\b/.test(text)) return null;
  return rules.find(([pattern]) => pattern.test(text))?.[1] ?? null;
}

/** Received principal and yield have distinct purposes; a redemption is not all yield. */
export function descriptionIncomeCategory(description: string): string | null {
  const text = normalize(description);
  if (/\b(?:resgate|reembolso|restituicao|transferencia)\b/.test(text)) return null;
  if (/\b(?:rendimentos?|dividendos?|juros\s+(?:recebidos?|sobre\s+capital\s+proprio)|jcp)\b/.test(text)) return "Rendimentos";
  if (/\b(?:emprestimos?|consignado|credito\s+(?:pessoal|facil\s+mobi))\b/.test(text)) return "Empréstimos";
  return null;
}

/** Respect a category expressly named by the person, including custom categories. */
export function hasExplicitExpenseCategory(message: string, category: string, description = "", bindToItem = false): boolean {
  const text = normalize(message), name = normalize(category.trim());
  const named = (value: string) => !!name && ` ${normalize(value)} `.includes(` ${name} `);
  if (!named(text)) return false;
  if (!bindToItem || /\b(todos|todas|ambos|ambas|tudo)\b/.test(text)) return true;
  const clauses: string[] = [];
  for (const part of message.split(/\n|;|\s+e\s+(?=(?:r\$\s*)?\d+|(?:gastei|paguei|comprei|registre|lance)\b)/i)) {
    if (clauses.length && /^(?:(?:na|em|este|essa) )?categoria\b/.test(normalize(part))) clauses[clauses.length - 1] += ` ${part}`;
    else clauses.push(part);
  }
  const target = normalize(description).replace(/^(?:compra|pagamento|assinatura) (?:de |do |da )?/, "");
  const itemClauses = target ? clauses.filter(clause => normalize(clause).includes(target)) : [];
  return itemClauses.length ? itemClauses.some(named) : true;
}

/** Correct inferred categories before saving, keeping explicit choices and every other field intact. */
export function normalizeExpenseCategories(message: string, result: AIResult): AIResult {
  if (result.intent !== "finance_register") return result;
  const batch = (result.finances?.length ?? 0) > 1;
  const normalizeFinance = (finance: FinanceData): FinanceData => {
    const current = typeof finance.category === "string" ? finance.category.trim() : "";
    const missing = !current || /^(sem categoria|uncategorized|nao categorizado)$/.test(normalize(current));
    const description = typeof finance.description === "string" ? finance.description : "";
    if (hasExplicitExpenseCategory(message, current, description, batch)) return missing ? { ...finance, category: "Outros" } : finance;
    const inferred = finance.type === "expense" ? descriptionExpenseCategory(description) : finance.type === "income" ? descriptionIncomeCategory(description) : null;
    const category = inferred ?? (missing ? "Outros" : current);
    return category === finance.category ? finance : { ...finance, category };
  };
  return { ...result, ...(result.finance ? { finance: normalizeFinance(result.finance) } : {}), ...(result.finances ? { finances: result.finances.map(normalizeFinance) } : {}) };
}
