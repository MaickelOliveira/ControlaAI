import { displayCardLimits } from "./bank-card-limit";
import { bankDate, bankMoney, bankResourceName, type BankOverview, type BankResource } from "./open-finance-display";
import { normalizeBankText, type BankQuestion } from "./bank-question-parser";
import { hasZeroBankDebt, matchesBankDebtPurpose } from "./bank-debt";
const safe = (text: string) => text.replace(/[\r\n*`_~<>]/g, " ").slice(0, 180);
const canonicalBank = (text: string) => normalizeBankText(text).replace(/^banco /, "").replace(/ (?:pessoa fisica|pessoa juridica|pf|pj)$/, "");
const includesName = (text: string, name: string) => ` ${normalizeBankText(text)} `.includes(` ${name} `);
export function matchingBankNames(names: string[], requested: string, exactOnly = false): string[] {
  const target = canonicalBank(requested);
  const exact = names.filter(name => canonicalBank(name) === target);
  return exact.length || exactOnly ? exact : names.filter(name => includesName(name, target));
}
type Amount = { amount: string | number | null | undefined; currency: string | null | undefined };

/** The database stores decimal amounts with eight places. Never sum through floating point. */
export function bankAmountTotals(values: Amount[], incomplete: boolean): string[] {
  const amounts = new Map<string, bigint>();
  let missing = false;
  for (const value of values) {
    const raw = String(value.amount ?? "");
    if (!value.currency || !/^-?\d{1,16}(\.\d{1,8})?$/.test(raw) || bankMoney(value.amount, value.currency) === "Não informado") { missing = true; continue; }
    const [whole, fraction = ""] = raw.replace(/^-/, "").split(".");
    const units = (BigInt(whole) * BigInt(100000000) + BigInt(fraction.padEnd(8, "0"))) * (raw.startsWith("-") ? BigInt(-1) : BigInt(1));
    amounts.set(value.currency, (amounts.get(value.currency) ?? BigInt(0)) + units);
  }
  return [...amounts].map(([currency, units]) => {
    const absolute = units < BigInt(0) ? -units : units;
    const text = `${units < BigInt(0) ? "-" : ""}${absolute / BigInt(100000000)}.${String(absolute % BigInt(100000000)).padStart(8, "0")}`;
    return `${incomplete || missing ? "Subtotal conhecido" : "Total informado"}: ${bankMoney(text, currency)}`;
  });
}

function banksFor(data: BankOverview, question: BankQuestion) {
  const active = data.connections.filter(c => c.status === "active" && !c.archived_at);
  const target = question.bankName ? canonicalBank(question.bankName) : null;
  const exact = target ? active.filter(c => canonicalBank(c.institution_name) === target) : [];
  const selected = !target ? active : exact.length ? exact : active.filter(c => includesName(c.institution_name, target) || data.resources.some(r => r.connection_id === c.id && includesName(r.name, target)));
  const groups = new Map<string, { name: string; resources: BankResource[] }>();
  for (const connection of selected) {
    const resources = data.resources.filter(r => r.connection_id === connection.id && (!question.last4 || r.identification_last4 === question.last4));
    if (question.last4 && !resources.length) continue;
    const key = connection.institution_id ?? connection.id;
    const group = groups.get(key) ?? { name: connection.institution_name, resources: [] };
    for (const resource of resources) if (!group.resources.some(r => r.id === resource.id)) group.resources.push(resource);
    groups.set(key, group);
  }
  return [...groups.values()];
}

/** Format only the authenticated overview; no provider calls, model output or cross-mode joins. */
export function formatBankQuestion(data: BankOverview, question: BankQuestion, modeLabel: string): string {
  const groups = banksFor(data, question);
  if (!groups.length) return question.bankName || question.last4
    ? `Não encontrei ${safe(question.bankName ?? "esse cartão")}${question.last4 ? ` · final ${question.last4}` : ""} entre os bancos conectados em ${safe(modeLabel)}. Confira Contas e o modo/empresa selecionado.`
    : `Nenhum banco conectado em ${safe(modeLabel)}. A conexão fica na aba Contas.`;
  const labels = { loans: "Empréstimos", financings: "Financiamentos", limits: "Crédito dos cartões", balances: "Saldos bancários", investments: "Investimentos", bills: "Faturas", spending: "Gastos" };
  const debt = question.kind === "loans" || question.kind === "financings";
  const received: Amount[] = [];
  let incomplete = !!data.truncated;
  let omitted = false;
  const blocks = groups.map(group => {
    const wanted = { loans: "loan", financings: "financing", limits: "card", balances: "account", investments: "investment", bills: "card", spending: "account" }[question.kind];
    const candidates = group.resources.filter(r => r.resource_type === wanted && (!debt || matchesBankDebtPurpose(r, question.keyword)));
    const resources = candidates.filter(r => !debt || !hasZeroBankDebt(r, data));
    const hiddenZero = candidates.length - resources.length;
    const lines: string[] = [];
    const bankAmounts: Amount[] = candidates.filter(r => debt && hasZeroBankDebt(r, data)).map(r => ({ amount: "0", currency: data.credit.find(c => c.resource_id === r.id)?.currency }));
    for (const resource of resources) {
      const name = `${safe(bankResourceName(resource.name))}${resource.identification_last4 ? ` · final ${safe(resource.identification_last4)}` : ""}`;
      if (debt) {
        const detail = data.credit.find(c => c.resource_id === resource.id);
        const amount = { amount: detail?.outstanding_amount, currency: detail?.currency };
        bankAmounts.push(amount);
        lines.push(`${name}\nSaldo devedor: ${bankMoney(amount.amount, amount.currency)}\nContratado: ${bankMoney(detail?.contract_amount, detail?.currency)} · Próxima parcela: ${bankMoney(detail?.next_installment_amount, detail?.currency)}\nVencimento final: ${bankDate(detail?.due_date)}`);
      } else if (question.kind === "limits") {
        const limits = displayCardLimits(data.limits.filter(l => l.resource_id === resource.id));
        if (!limits.length) lines.push(`${name} · Limite não informado pelo banco.`);
        for (const limit of limits) lines.push(`${name} · ${safe(limit.line_name ?? "Linha de crédito")}${limit.consolidation_type ? ` · ${safe(limit.consolidation_type)}` : ""}\nDisponível: ${bankMoney(limit.available_amount, limit.currency)}\nTotal: ${bankMoney(limit.total_amount, limit.currency)} · Utilizado: ${bankMoney(limit.used_amount, limit.currency)}`);
      } else if (question.kind === "balances") {
        bankAmounts.push({ amount: resource.available_amount, currency: resource.currency });
        lines.push(`${name} · Saldo disponível: ${bankMoney(resource.available_amount, resource.currency)}`);
      } else if (question.kind === "investments") {
        lines.push(`${name} · Bruto: ${bankMoney(resource.gross_amount, resource.currency)} · Líquido: ${bankMoney(resource.net_amount, resource.currency)} · Posição: ${bankDate(resource.valuation_date)}`);
      } else if (question.kind === "bills") {
        const bills = data.bills.filter(b => b.resource_id === resource.id).sort((a, b) => (b.due_date ?? "").localeCompare(a.due_date ?? ""));
        if (!bills.length) lines.push(`${name} · Faturas não informadas pelo banco.`);
        for (const bill of bills) lines.push(`${name} · Vencimento: ${bankDate(bill.due_date)}\nTotal: ${bankMoney(bill.total_amount, bill.currency)} · Mínimo: ${bankMoney(bill.minimum_payment_amount, bill.currency)} · Pagamento: ${bill.status === "unknown" ? "não informado" : safe(bill.status)}`);
      }
    }
    if (!candidates.length) incomplete = true;
    received.push(...bankAmounts);
    omitted ||= lines.length > 10;
    const dates = [...new Set(resources.map(r => r.synced_at?.slice(0, 10)).filter(Boolean))].sort();
    const empty = hiddenZero ? "Não há saldo devedor pendente nos contratos recebidos." : question.keyword ? `Nenhum contrato correspondente a ${safe(question.keyword)} nos dados recebidos.` : `O banco ainda não informou ${labels[question.kind].toLowerCase()}.`;
    return `*${safe(group.name)}*${debt && resources.length ? ` · ${resources.length} operação(ões) recebida(s)` : ""}\n\n${lines.slice(0, 10).join("\n\n") || empty}${bankAmounts.length && resources.length ? `\n\n${bankAmountTotals(bankAmounts, !!data.truncated).join("\n")}` : ""}${lines.length > 10 ? `\nMais ${lines.length - 10} registro(s); veja os detalhes em Contas.` : ""}${dates.length ? `\nRecebido em ${bankDate(dates[0])}${dates.length > 1 ? ` a ${bankDate(dates.at(-1))}` : ""}.` : ""}`;
  });
  let result = `${labels[question.kind]} recebidos · ${safe(modeLabel)}${question.keyword ? `\n🔎 Contrato: ${safe(question.keyword)}` : ""}\n\n${blocks.join("\n\n")}`;
  if (debt || question.kind === "balances") result += `\n\n${bankAmountTotals(received, incomplete).join("\n") || "Total não informado pelos bancos."}`;
  if (question.kind === "limits") result += "\n\nLinhas e limites compartilhados não são somados. Crédito disponível não é saldo em conta.";
  result += "\nValores não informados permanecem desconhecidos. Posição conforme os dados recebidos de cada banco; ausência de dados não confirma valor zero.";
  if (data.truncated) result += " Consulta parcial: há dados além do limite recebido; consulte Contas.";
  if (omitted) result += " Detalhes adicionais ficam em Contas; os totais conhecidos incluem todas as operações recebidas.";
  if (data.sync.some(s => s.status !== "complete")) result += " Há uma importação pendente ou com falha.";
  return result;
}
