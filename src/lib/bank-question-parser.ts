export type BankQuestion = {
  kind: "spending" | "limits" | "balances" | "investments" | "bills" | "loans" | "financings";
  from: string;
  to: string;
  source?: "card" | "account";
  bankName?: string;
  last4?: string;
  explicitBank?: boolean;
  keyword?: string;
};

export const normalizeBankText = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
const mutation = /\b(registr\w*|anot\w*|lanc\w*|paga\w*|pagu\w*|cancela\w*|cancel\w*|apag\w*|exclu\w*|cri[ae]\w*|contrat\w*)\b/;
function queryText(question: string): string {
  return normalizeBankText(question).replace(/^por favor[, ]+/, "").replace(/^(?:(?:oi|ola|ei),? )?(?:zelo|rita)[,:]? /, "").replace(/^por favor[, ]+/, "").replace(/\b(?:me mostra|mostra)\b/, "mostre").replace(/[?!.]+$/, "").replace(/,? por favor$/, "").trim();
}

function monthPeriod(today: string, previous: boolean) {
  const [year, month] = today.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1 - (previous ? 1 : 0), 1));
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}

function bankFilter(suffix: string): Pick<BankQuestion, "bankName" | "last4"> | null {
  if (!suffix) return {};
  const match = suffix.match(/^ (?:(?:do|da|dos|das|no|na|nos|nas|em|de|por) )?(.+)$/);
  if (!match) return null;
  const last4 = match[1].match(/\bfinal (\d{4})\b/)?.[1];
  let target = match[1].replace(/\bfinal \d{4}\b/, "").trim();
  if (/^(?:(?:todos|todas|os|as|meus|minhas|bancos|banco|contas|conta|cartoes|cartao|bancarias|bancarios|conectados|conectadas|cada|um|dos|das|de|credito)\s*)+$/.test(target)) target = "";
  else target = target.replace(/^(?:(?:o|a|meu|minha) )?(?:cartao(?: de credito)?|conta(?: bancaria)?) (?:do |da )?/, "").replace(/^(?:(?:o|a|meu|minha) )?banco /, "");
  if (target.length > 80 || /^\d+$/.test(target) || /[\n<>*`~]/.test(target) || /^(?:e|ou|sem|com|acima|abaixo)\b/.test(target)) return null;
  return { ...(target ? { bankName: target } : {}), ...(last4 ? { last4 } : {}) };
}

const positionPatterns: Array<{ kind: BankQuestion["kind"]; pattern: RegExp }> = [
  { kind: "loans", pattern: /^(?:quanto (?:eu )?tenho (?:de|em) emprestimos?|quanto (?:eu )?devo (?:de|em) emprestimos?|quanto (?:eu )?estou devendo (?:de|em) emprestimos?|quantos emprestimos (?:eu )?tenho|(?:quais (?:sao )?(?:os )?(?:meus )?|(?:me )?mostre (?:os )?(?:meus )?|meus )emprestimos)(.*)$/ },
  { kind: "financings", pattern: /^(?:quanto (?:eu )?tenho (?:de|em) financiamentos?|quanto (?:eu )?devo (?:de|em) financiamentos?|quantos financiamentos (?:eu )?tenho|(?:quais (?:sao )?(?:os )?(?:meus )?|(?:me )?mostre (?:os )?(?:meus )?|meus )financiamentos)(.*)$/ },
  { kind: "limits", pattern: /^(?:quanto (?:eu )?tenho (?:de|em) (?:credito|limite)(?: disponivel| total)?|quanto (?:de )?(?:credito|limite)(?: disponivel)? (?:eu )?tenho|quanto (?:eu )?(?:ja )?(?:utilizei|usei) (?:do )?limite|qual (?:e )?(?:o )?(?:meu )?(?:limite|credito)(?: disponivel| total| utilizado)?|quais (?:sao )?(?:os )?(?:meus )?limites|(?:me )?mostre (?:os )?(?:meus )?limites)(.*)$/ },
  { kind: "balances", pattern: /^(?:qual (?:e )?(?:o )?(?:meu )?saldo(?: disponivel| bancario)?|quanto (?:eu )?tenho (?:de )?saldo(?: disponivel)?|(?:me )?mostre (?:os )?(?:meus )?saldos)(.*)$/ },
  { kind: "investments", pattern: /^(?:como estao (?:os )?(?:meus )?investimentos|(?:me )?mostre (?:os )?(?:meus )?investimentos|quais (?:sao )?(?:os )?(?:meus )?investimentos|quanto (?:eu )?tenho (?:em investimentos|investido))(.*)$/ },
  { kind: "bills", pattern: /^(?:quais (?:sao )?(?:as )?(?:minhas )?faturas|(?:me )?mostre (?:as )?(?:minhas )?faturas|qual (?:e )?(?:o )?valor (?:da|das) (?:minha |minhas )?faturas?|quanto (?:e |esta )?(?:a )?(?:minha )?fatura)(.*)$/ },
];

function remainingFinancing(text: string): Pick<BankQuestion, "kind" | "keyword" | "bankName" | "last4"> | null {
  const match = text.match(/^(?:quanto (?:ainda )?falta (?:pra |para )?(?:(?:min|mim|eu) )?(?:pagar|quitar)|quanto (?:eu )?(?:ainda )?(?:devo|estou devendo)) (?:do |da |no |na |o |a )?(?:financiamento (?:do |da )?)?(?:meu |minha )?(carro|veiculo|automovel|moto|motocicleta|casa|imovel|habitacao)(.*)$/);
  if (!match || mutation.test(text.replace(/\bpagar\b/, ""))) return null;
  const filter = bankFilter(match[2]);
  return filter ? { kind: "financings", keyword: match[1], ...filter } : null;
}

function nextFinancingInstallment(text: string): Pick<BankQuestion, "kind" | "keyword" | "bankName" | "last4"> | null {
  if (mutation.test(text)) return null;
  const clause = text.split(/[?.!]/, 1)[0].trim();
  const match = clause.match(/^(?:qual (?:e )?(?:o )?valor da (?:proxima )?parcela|quanto (?:e|sera|custa) a (?:proxima )?parcela|de quanto e a (?:proxima )?parcela) (?:do |da )?(?:meu |minha )?financiamento (?:do |da )?(?:meu |minha )?(carro|veiculo|automovel|moto|motocicleta|casa|imovel|habitacao)(.*)$/);
  if (!match) return null;
  const filter = bankFilter(match[2]);
  return filter ? { kind: "financings", keyword: match[1], ...filter } : null;
}

/** Only read-only questions enter this path. Unrecognized filters are never discarded. */
export function parseBankQuestion(question: string, today: string): BankQuestion | null {
  let text = normalizeBankText(question);
  if (text.length > 500) return null;
  text = queryText(question);
  if (/\b(empresa|empresarial|pessoal|familia|ontem|hoje|semana|ano|com|ifood|categoria)\b/.test(text)) return null;
  const payoff = remainingFinancing(text) ?? nextFinancingInstallment(text);
  if (payoff && !/\b(mes|ontem|ano|anterior|passad\w*|(?:19|20)\d{2})\b/.test(text.replace(/\bfinal \d{4}\b/g, ""))) return { ...payoff, ...monthPeriod(today, false) };
  if (mutation.test(text)) return null;
  if (/^(?:quanto (?:eu )?gastei|quanto gastamos)/.test(text)) {
    const period = monthPeriod(today, /mes (passado|anterior)/.test(text));
    const suffix = text.replace(/^(?:quanto (?:eu )?gastei|quanto gastamos)/, "").replace(/ (?:no )?(?:mes passado|mes anterior|este mes|nesse mes|neste mes)$/, "");
    if (/\b(?:mes|passado|anterior)\b/.test(suffix)) return null;
    const filter = bankFilter(suffix);
    if (!filter || filter.last4) return null;
    return { kind: "spending", ...period, ...filter, ...(filter.bankName ? { explicitBank: /\b(?:bancos?|cartao|cartoes|bancarias?)\b/.test(suffix) } : {}), ...(/cartao|cartoes/.test(suffix) ? { source: "card" as const } : /bancos/.test(suffix) && !filter.bankName ? { source: "account" as const } : {}) };
  }
  if (/\b(mes|vencid\w*|anterior|passad\w*|(?:19|20)\d{2})\b/.test(text.replace(/\bfinal \d{4}\b/g, ""))) return null;
  for (const { kind, pattern } of positionPatterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const filter = bankFilter(match[1]);
    if (!filter) return null;
    // A bare "saldo" is the Zelo period balance, not a bank position.
    if (kind === "balances" && !match[1]) return null;
    return { kind, ...monthPeriod(today, false), ...filter };
  }
  return null;
}

/** Protect unsupported bank-position questions from being answered as ordinary expenses. */
export function isBankPositionQuestion(question: string): boolean {
  const text = queryText(question);
  if (remainingFinancing(text) || nextFinancingInstallment(text)) return true;
  return /^(?:qual|quais|quanto|quantos|como|mostre|me mostre|meus|minhas)\b/.test(text)
    && (/\b(?:emprestimos?|financiamentos?|investimentos?|limites?|credito|faturas?)\b/.test(text) || (/\bsaldos?\b/.test(text) && /\b(?:bancos?|bancarias?)\b/.test(text)))
    && !mutation.test(text) && !/\b(?:gastei|gastamos|gastos)\b/.test(text);
}
