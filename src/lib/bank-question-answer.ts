import { cardLimitAmountsDisagree, displayCardLimits } from "./bank-card-limit";
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
  const connectedGroups = banksFor(data, question);
  if (!connectedGroups.length) return question.bankName || question.last4
    ? `Não encontrei ${safe(question.bankName ?? "esse cartão")}${question.last4 ? ` · final ${question.last4}` : ""} entre os bancos conectados em ${safe(modeLabel)}. Confira Contas e o modo/empresa selecionado.`
    : `Nenhum banco conectado em ${safe(modeLabel)}. A conexão fica na aba Contas.`;
  if(question.kind==="balances"&&question.balanceFilter){
    const missing=question.balanceFilter==="missing";
    const accounts=connectedGroups.flatMap(group=>group.resources.filter(resource=>resource.resource_type==="account"&&(
      missing?bankMoney(resource.available_amount,resource.currency)==="Não informado":
        bankMoney(resource.available_amount,resource.currency)!=="Não informado"&&Number(resource.available_amount)<0
    )).map(resource=>`• ${safe(group.name)} · ${safe(bankResourceName(resource.name))}${missing?"":`: ${bankMoney(resource.available_amount,resource.currency)}`}`));
    const heading=missing?"Contas sem saldo disponível informado":"Contas com saldo negativo informado";
    const empty=missing?"Nenhuma conta recebida sem saldo informado foi identificada.":"Nenhuma conta com saldo negativo foi identificada nos dados recebidos.";
    const banksWithoutAccounts=missing?connectedGroups.filter(group=>!group.resources.some(resource=>resource.resource_type==="account")).map(group=>safe(group.name)):[];
    const bankNotice=banksWithoutAccounts.length?`\nBancos que não enviaram dados de conta: ${banksWithoutAccounts.slice(0,20).join(", ")}.${banksWithoutAccounts.length>20?` Mais ${banksWithoutAccounts.length-20} banco(s) em Contas.`:""}`:"";
    return `${heading} · ${safe(modeLabel)}\n${accounts.slice(0,20).join("\n")||empty}${accounts.length>20?`\nMais ${accounts.length-20} conta(s) em Contas.`:""}${bankNotice}\nPosição conforme os dados recebidos; ausência de dados não confirma saldo zero.${data.truncated?" Consulta parcial: há dados além do limite recebido.":""}${data.sync.some(sync=>sync.status!=="complete")?" Há uma importação pendente ou com falha.":""}`;
  }
  const labels = { loans: "Empréstimos", financings: "Financiamentos", limits: "Crédito dos cartões", balances: "Saldos bancários", investments: "Investimentos", bills: "Faturas", spending: "Gastos" };
  const debt = question.kind === "loans" || question.kind === "financings";
  const wantedDebtType = question.kind === "loans" ? "loan" : "financing";
  const groups = question.settledOnly
    ? connectedGroups.filter(group => group.resources.some(resource => resource.resource_type === "loan" && hasZeroBankDebt(resource,data)))
    : question.kind === "investments"
    ? connectedGroups.filter(group => group.resources.some(resource => resource.resource_type === "investment"))
    : debt && question.keyword
    ? connectedGroups.filter(group => group.resources.some(resource => resource.resource_type === wantedDebtType && matchesBankDebtPurpose(resource, question.keyword)))
    : connectedGroups;
  if (!groups.length) return question.settledOnly
    ? `Não identifiquei empréstimos com saldo devedor informado como zero nos dados recebidos em ${safe(modeLabel)}. Isso não confirma que não haja contratos quitados; confira o banco.`
    : question.kind === "investments"
    ? `Nenhum investimento informado pelos bancos conectados em ${safe(modeLabel)}. Isso não confirma ausência de investimentos; confira cada banco.${data.truncated ? " Consulta parcial: há dados além do limite recebido." : ""}${data.sync.some(s => s.status !== "complete") ? " Há uma importação pendente ou com falha." : ""}`
    : `Não encontrei contrato correspondente a ${safe(question.keyword ?? "essa busca")} nos dados recebidos em ${safe(modeLabel)}. Isso não confirma ausência de dívida; confira também o banco. ${data.truncated ? "Consulta parcial: há dados além do limite recebido. " : ""}${data.sync.some(s => s.status !== "complete") ? "Há uma importação pendente ou com falha." : ""}`.trim();
  const received: Amount[] = [];
  let incomplete = !!data.truncated;
  let omitted = false;
  let shownDebtCount = 0;
  const blocks = groups.map(group => {
    const wanted = { loans: "loan", financings: "financing", limits: "card", balances: "account", investments: "investment", bills: "card", spending: "account" }[question.kind];
    const candidates = group.resources.filter(r => r.resource_type === wanted && (!debt || matchesBankDebtPurpose(r, question.keyword)));
    const resources = candidates.filter(r => question.settledOnly ? hasZeroBankDebt(r,data) : !debt || !hasZeroBankDebt(r, data));
    if (debt) shownDebtCount += resources.length;
    const hiddenZero = candidates.length - resources.length;
    const lines: string[] = [];
    const bankAmounts: Amount[] = candidates.filter(r => debt && hasZeroBankDebt(r, data)).map(r => ({ amount: "0", currency: data.credit.find(c => c.resource_id === r.id)?.currency }));
    for (const resource of resources) {
      const name = `${safe(bankResourceName(resource.name))}${resource.identification_last4 ? ` · final ${safe(resource.identification_last4)}` : ""}`;
      if (debt) {
        const detail = data.credit.find(c => c.resource_id === resource.id);
        const amount = { amount: detail?.outstanding_amount, currency: detail?.currency };
        bankAmounts.push(amount);
        const installment = detail?.next_installment_amount == null
          ? "Valor da próxima parcela não informado pelo banco"
          : `Valor da próxima parcela: ${bankMoney(detail.next_installment_amount, detail.currency)}`;
        lines.push(question.settledOnly ? `${name}\nSaldo devedor informado: ${bankMoney(amount.amount,amount.currency)}` : `${name}\nSaldo devedor: ${bankMoney(amount.amount, amount.currency)}\nContratado: ${bankMoney(detail?.contract_amount, detail?.currency)} · ${installment}\nVencimento final: ${bankDate(detail?.due_date)}`);
      } else if (question.kind === "limits") {
        const limits = displayCardLimits(data.limits.filter(l => l.resource_id === resource.id));
        if (!limits.length) lines.push(`${name} · Limite não informado pelo banco.`);
        for (const limit of limits) lines.push(`${name} · ${safe(limit.line_name ?? "Linha de crédito")}${limit.consolidation_type ? ` · ${safe(limit.consolidation_type)}` : ""}\nDisponível: ${bankMoney(limit.available_amount, limit.currency)}\nTotal: ${bankMoney(limit.total_amount, limit.currency)} · Utilizado: ${bankMoney(limit.used_amount, limit.currency)}${cardLimitAmountsDisagree(limit) ? "\n⚠️ Os valores desta linha não fecham entre si; confirme o limite no banco." : ""}`);
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
    const dates = [...new Set(resources.map(r => r.synced_at).filter(Boolean))].sort();
    const empty = hiddenZero ? "Não há saldo devedor pendente nos contratos recebidos." : question.keyword ? `Nenhum contrato correspondente a ${safe(question.keyword)} nos dados recebidos.` : `O banco ainda não informou ${labels[question.kind].toLowerCase()}.`;
    const receivedFrom = dates.length ? bankDate(dates[0]) : "";
    const receivedTo = dates.length ? bankDate(dates.at(-1)) : "";
    return `*${safe(group.name)}*${debt && resources.length ? ` · ${resources.length} operação(ões) recebida(s)` : ""}\n\n${lines.slice(0, 10).join("\n\n") || empty}${!question.settledOnly&&groups.length>1&&resources.length>1&&bankAmounts.length ? `\n\n${bankAmountTotals(bankAmounts, !!data.truncated).join("\n")}` : ""}${lines.length > 10 ? `\nMais ${lines.length - 10} registro(s); veja os detalhes em Contas.` : ""}${dates.length ? `\nRecebido em ${receivedFrom}${receivedFrom !== receivedTo ? ` a ${receivedTo}` : ""}.` : ""}`;
  });
  let result = `${question.settledOnly?"Empréstimos com saldo informado como zero":labels[question.kind]+" recebidos"} · ${safe(modeLabel)}${question.keyword ? `\n🔎 Contrato: ${safe(question.keyword)}` : ""}\n\n${blocks.join("\n\n")}`;
  if ((question.kind === "balances" || debt && shownDebtCount !== 1) && !question.settledOnly) result += `\n\n${bankAmountTotals(received, incomplete).join("\n") || "Total não informado pelos bancos."}`;
  if(question.settledOnly)result += "\nSaldo zero recebido não confirma quitação contratual; confirme com o banco. Contratos já encerrados podem não aparecer nos dados recebidos.";
  if (question.kind === "limits") result += "\n\nLinhas e limites compartilhados não são somados. Crédito disponível não é saldo em conta.";
  result += "\nValores não informados permanecem desconhecidos. Posição conforme os dados recebidos de cada banco; ausência de dados não confirma valor zero.";
  if (data.truncated) result += " Consulta parcial: há dados além do limite recebido; consulte Contas.";
  if (omitted) result += " Detalhes adicionais ficam em Contas; os totais conhecidos incluem todas as operações recebidas.";
  if (data.sync.some(s => s.status !== "complete")) result += " Há uma importação pendente ou com falha.";
  return result;
}
