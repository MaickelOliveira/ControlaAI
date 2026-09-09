/**
 * Interpreta pedidos de lembrete relativos a um compromisso, por exemplo:
 * "me avisa uma hora antes da reunião". Mantemos essa leitura determinística
 * porque um classificador pode confundir "avisa" com edição de agenda e
 * devolver um patch vazio — foi exatamente o que fazia a conversa parar.
 */
export type AppointmentReminderRequest = {
  offsetMinutes: number;
  keyword?: string;
};

const NUMBER_WORDS: Record<string, number> = {
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  tres: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7,
  oito: 8,
  nove: 9,
  dez: 10,
  quinze: 15,
  vinte: 20,
  trinta: 30,
  quarenta: 40,
  cinquenta: 50,
  uno: 1,
  una: 1,
  dos: 2,
  cuatro: 4,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  quince: 15,
  veinte: 20,
  treinta: 30,
  cuarenta: 40,
  cincuenta: 50,
};

function withoutAccents(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function amountFrom(raw: string | undefined): number | null {
  if (!raw) return null;
  if (/^\d+$/.test(raw)) return Number(raw);
  return NUMBER_WORDS[raw] ?? null;
}

export function parseAppointmentReminderRequest(text: string): AppointmentReminderRequest | null {
  const normalized = withoutAccents(text);
  const verbRe = /\b(?:avisa|avise|avisar|avisame|lembra|lembre|lembrar|recuerda|recuerdame|recordar)\b/g;
  const beforeIndex = normalized.lastIndexOf("antes");
  const verbMatches = [...normalized.matchAll(verbRe)].filter(match => (match.index ?? -1) < beforeIndex);
  const lastVerb = verbMatches.at(-1);
  if (!lastVerb || beforeIndex < 0) {
    return null;
  }
  // Considera apenas o trecho do verbo de lembrete até "antes". Assim o
  // horário do próprio compromisso ("às 17h") não vira, por engano, um
  // aviso de 17 horas de antecedência.
  const durationClause = normalized.slice(lastVerb.index, beforeIndex);

  let offsetMinutes: number | null = null;
  if (/\b(?:meia|media)\s+hora\b/.test(durationClause)) {
    offsetMinutes = 30;
  } else {
    const hours = durationClause.match(/\b(\d{1,2}|um|uma|dois|duas|uno|una|dos|tres|quatro|cuatro|cinco|seis|sete|siete|oito|ocho|nove|nueve|dez|diez)\s*(?:h\b|hora(?:s)?\b)/);
    const minutes = durationClause.match(/\b(\d{1,3}|quinze|quince|vinte|veinte|trinta|treinta|quarenta|cuarenta|cinquenta|cincuenta)\s*(?:min\b|minuto(?:s)?\b)/);
    const hourAmount = amountFrom(hours?.[1]);
    const minuteAmount = amountFrom(minutes?.[1]);
    if (hourAmount !== null || minuteAmount !== null) {
      offsetMinutes = (hourAmount ?? 0) * 60 + (minuteAmount ?? 0);
    }
  }

  // Sem uma duração explícita não dá para prometer um horário de aviso.
  if (!offsetMinutes || offsetMinutes < 1 || offsetMinutes > 7 * 24 * 60) return null;

  // Preserva acentos no termo usado na busca ("reunião" deve encontrar
  // "Reunião"), removendo apenas artigos/possessivos e pontuação final.
  const keywordMatch = text.match(/\bantes\s+(?:d(?:a|o|e)|de\s+la|del)\s+(.+?)\s*[.!?]*$/i);
  const keyword = keywordMatch?.[1]
    ?.trim()
    .replace(/^(?:a|o|minha|meu|essa|esse|aquele|aquela|la|el|mi|esta|este|esa|ese)\s+/i, "")
    .replace(/[.!?]+$/g, "")
    .trim();

  return { offsetMinutes, keyword: keyword || undefined };
}

/**
 * Pedidos que começam diretamente pelo verbo de aviso referem-se a um
 * compromisso já cadastrado ("me avisa uma hora antes da reunião"). Essa
 * distinção permite resolver o lembrete antes de chamar o classificador de
 * IA, que pode interpretar "avisa" como uma edição genérica da agenda.
 *
 * Mensagens que primeiro criam o compromisso ("marque uma reunião amanhã e
 * me avise uma hora antes") continuam no fluxo normal de agenda_create.
 */
export function isStandaloneAppointmentReminderRequest(text: string): boolean {
  const normalized = withoutAccents(text).trim();
  return /^(?:(?:por favor|porfa)\s*,?\s*)?(?:(?:voce|tu)\s+)?(?:me\s+)?(?:avisa|avise|avisar|avisame|lembra|lembre|lembrar|recuerda|recuerdame|recordar)\b/.test(normalized);
}

/** Separa avisos da Agenda de lembretes comuns. A Agenda tem sua própria
 * política automática (2h e 15min); outros assuntos continuam livres para
 * usar exatamente o horário solicitado no módulo de Lembretes. */
export function isAgendaReminderTarget(request: AppointmentReminderRequest, text = ""): boolean {
  const target = withoutAccents(`${request.keyword ?? ""} ${text}`);
  return /\b(?:agenda|compromisso|compromisos?|reuniao|reuniones?|meet|consulta|cita|evento|eventos?|videoconferencia)\b/.test(target);
}

export function appointmentReminderAt(startAt: string, offsetMinutes: number): string {
  return new Date(new Date(startAt).getTime() - offsetMinutes * 60_000).toISOString();
}

export function formatReminderOffset(offsetMinutes: number, locale?: string): string {
  if (offsetMinutes % 1_440 === 0) {
    const days = offsetMinutes / 1_440;
    return `${days} ${locale === "es" ? "día" : "dia"}${days === 1 ? "" : "s"}`;
  }
  if (offsetMinutes % 60 === 0) {
    const hours = offsetMinutes / 60;
    return `${hours} hora${hours === 1 ? "" : "s"}`;
  }
  if (offsetMinutes > 60) {
    const hours = Math.floor(offsetMinutes / 60);
    const minutes = offsetMinutes % 60;
    return `${hours}h${String(minutes).padStart(2, "0")}`;
  }
  return `${offsetMinutes} minuto${offsetMinutes === 1 ? "" : "s"}`;
}
