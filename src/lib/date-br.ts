const TZ = "America/Sao_Paulo";

/** Data e hora atual em São Paulo (para exibição e lógica de negócio) */
export function nowBR(): Date {
  // Retorna um Date com os componentes de horário SP mas como objeto Date (UTC internamente)
  const sp = new Date().toLocaleString("en-US", { timeZone: TZ });
  return new Date(sp);
}

/** Data atual em SP no formato YYYY-MM-DD */
export function todayStrBR(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: TZ }).format(new Date());
}

/** Horário atual em SP no formato HH:MM */
export function nowTimeBR(): string {
  return new Date().toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
}

/** Data e hora atual SP para o prompt da IA */
export function nowISOBR(): string {
  const d = nowBR();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * Converte datetime gerado pela IA (interpretado como SP/Brasília UTC-3) para UTC ISO.
 * Ex: "2026-07-04T08:00:00" (SP) → "2026-07-04T11:00:00.000Z" (UTC)
 */
export function spToUTC(spDateTime: string): string {
  if (!spDateTime) return spDateTime;
  // Se já tem timezone explícito, respeita
  if (spDateTime.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(spDateTime)) {
    return new Date(spDateTime).toISOString();
  }
  // Trata como horário de SP (UTC-3) e converte para UTC
  return new Date(spDateTime + "-03:00").toISOString();
}

/** Formata UTC ISO como data SP: "03/07/2026" */
export function formatDateBR(utcISO: string): string {
  return new Date(utcISO).toLocaleDateString("pt-BR", { timeZone: TZ });
}

/** Formata UTC ISO como data+hora SP: "03/07/2026 às 08:00" */
export function formatDateTimeBR(utcISO: string): string {
  return new Date(utcISO).toLocaleString("pt-BR", {
    timeZone: TZ,
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

/** Label do mês atual em SP */
export function monthLabelBR(): string {
  return new Date().toLocaleDateString("pt-BR", { timeZone: TZ, month: "long", year: "numeric" });
}
