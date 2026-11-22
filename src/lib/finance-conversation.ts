type Turn = {role: "user" | "assistant"; content: string};
const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
const forecast = /\b(?:projecao financeira|previsao financeira|proyeccion financiera|fluxo de caixa|fluxo de caixa pessoal|flujo de caja|(?:previsao|projecao|prevision|proyeccion) (?:d[eo] |do meu |del )?saldo|saldo (?:financeiro |financeiro pessoal |financiero )?(?:projetado|proyectado|previsto|futuro|final)|saldo que (?:terei|vou ter)|quanto (?:dinheiro )?(?:(?:vai|ira|vai me|me vai) )?(?:sobrar[a]?|restara)|cuanto (?:me )?(?:sobrara|quedara)|dinheiro que sobrara|quanto terei (?:disponivel|no fim)|quanto (?:posso|poderei) gastar sem comprometer)\b/;
export function explicitPaidCount(text: string) {
  const s = norm(text);
  const match = s.match(/\b(?:ja\s+)?(?:paguei|pagamos|foram pag[oa]s?|foi pag[oa]s?|he pagado)\s+(\d{1,3})\s*(?:x\b|parcelas?|prestacoes|mes(?:es)?|cuotas?)\b/) ??
    s.match(/\b(\d{1,3})\s*(?:x|parcelas?|prestacoes|cuotas?)?\s*(?:ja\s+)?pag[oa]s?\b/);
  return match ? Number(match[1]) : undefined;
}
const incomeProblem = /\b(?:kd|cade|onde est(?:a|ao)|donde est(?:a|an))\b.*\b(?:receitas?|ingresos?)\b|\b(?:receitas?|ingresos?)\b[\s\S]{0,100}\b(?:zero|zerad[oa]s?|nao aparecem|nao estao aparecendo)\b|\b(?:receitas? previstas|receitas? (?:fixas|recorrentes)|salario e vale alimentacao)\b/;
const confirm = /^(?:sim|si|por favor|pode(?: ser)?|pode fazer|isso|claro|ok)[.!?\s]*$/;
const invitation = /(?:posso|quer|vou pedir|vou calcular|puedo|quieres|si quieres|se quiser)[\s\S]{0,250}(?:proje[çc][aã]o|previs[aã]o|proyecci[oó]n)|(?:proje[çc][aã]o|previs[aã]o)[\s\S]{0,140}pode ser\?/i;
const mutate = /^(?:(?:rita|zoe)[,!: ]+)?(?:(?:por favor|quero que voce|quero)\s+)*(?:criar?|crie|cri[ae]r|cadastre?|cadastrar|registre?|registrar|anote?|lanc[ae]r?|apague?|exclu\w*|cancel\w*|mude?|altere?)\b/;
const contextFinance = /\b(?:saldo|despesas?|receitas?|previsao financeira|projecao financeira|fluxo de caixa|sobrara?)\b/;
export function isFinanceScreenQuestion(text: string) {
  const s = norm(text);
  return (incomeProblem.test(s) || forecast.test(s) || /(?:por que|pq|porque).*\b(?:saldo|despesas?)\b/.test(s)) && !mutate.test(s);
}

export function financeConversation(text: string, history: readonly Turn[]) {
  const s = norm(text.trim()).replace(/\bdezembr9\b/g,"dezembro");
  const last = history.at(-1);
  const previous = history.filter(t => t.role === "user").at(-1);
  if (mutate.test(s) || /^(?:recebo|recebi|pago|paguei|ganho|transfira|aplica|invista)\b/.test(s)) return null;
  if (/\b(?:previsao do tempo|previsao de chuva)\b/.test(s) && !forecast.test(s)) return null;
  const periodFollowup = /^(?:faca isso|e (?:em|para)|agora (?:em|para)|(?:20\d{2}\?\s*)?quero de 20\d{2}|pq .*0 reais|por que .*zer)/.test(s);
  const context = previous && (contextFinance.test(norm(previous.content)) || /\bfaca isso\b/.test(norm(previous.content))) ? previous.content : "";
  let subject = s, prior = context;
  if (confirm.test(s)) {
    if (last?.role !== "assistant" || !invitation.test(last.content)) return null;
    subject = last.content.split(/(?:vou pedir|posso (?:fazer|calcular)|quer continuar)/i).at(-1) || last.content;
  } else if (periodFollowup && context) {
    subject = s;
  } else if (!forecast.test(s)) {
    const clarification = s === "?" && previous && incomeProblem.test(norm(previous.content));
    if (!incomeProblem.test(s) && !clarification) return null;
    // Leave explicit expense reports, benefits registration and single transaction edits with their existing handlers.
    if (/\b(?:crie|criar|cadastrar|cadastre|registre|registrar|apague|remova|edite|mude)\b/.test(s) && !/\b(?:onde|cade|kd|zerad[oa]s?|zero)\b/.test(s)) return null;
    return {kind:"income" as const, subject, prior};
  }
  if (!prior && last?.role === "assistant" && contextFinance.test(norm(last.content))) prior = last.content;
  return {kind:"projection" as const, subject, prior};
}
