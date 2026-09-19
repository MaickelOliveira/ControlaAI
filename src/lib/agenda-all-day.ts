/** Expressões explícitas que significam um compromisso sem horário. */
export function isAllDayAgendaText(text: string): boolean {
  const normalized = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

  if (/\b(?:nao|no)\b.{0,16}\b(?:dia todo|dia inteiro|todo o dia|todo el dia|all day)\b/.test(normalized)) {
    return false;
  }

  return /\b(?:dia todo|o dia todo|todo o dia|dia inteiro|dia completo|todo el dia|el dia completo|all day)\b/.test(normalized);
}
