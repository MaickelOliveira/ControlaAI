import {explicitFinanceCalendarPeriod} from "./ai-processor";

export function validImportDate(date:string) {
  if (!/^20\d\d-\d\d-\d\d$/.test(date)) return false;
  const parsed=new Date(date+"T12:00:00Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0,10)===date;
}

/** An explicit destination in the caption/confirmation takes precedence over OCR.
 * Preserve original days for a month-only request. Impossible dates need review. */
export function importDates<T extends {date:string}>(items:readonly T[], text:string, anchor:Date) {
  const normalized=text.normalize("NFD").replace(/\p{Diacritic}/gu,"").toLowerCase();
  const destination=normalized.match(/\b(?:para|pra|pro|em|no dia|el dia|en|com (?:a )?data(?: de)?)\s+((?:(?:o|el|dia|mes|de)\s+)*\d{1,2}\/\d{1,2}\/\d{4}|(?:(?:o|el|dia|mes|de)\s+)*(?:\d{1,2}\s+de\s+)?[a-z]+(?:\s+de)?\s+20\d{2})\b/g);
  if (!destination?.length) return null;
  if (destination.length!==1) return {invalid:true as const};
  const fragment=destination[0];
  const range=explicitFinanceCalendarPeriod(fragment,anchor,true);
  if (!range) return {invalid:true as const};
  const namedDay=fragment.match(/\b(\d{1,2}) de [a-z]+ (?:de )?20\d{2}$/);
  const exact=range.from===range.to ? range.from : namedDay ? range.from.slice(0,8)+namedDay[1].padStart(2,"0") : null;
  const updated=items.map(item=>({...item,date:exact??range.from.slice(0,8)+item.date.slice(8)}));
  if (updated.some(item=>!validImportDate(item.date))) return {invalid:true as const};
  return {items:updated, exact};
}

/** Only an unqualified yes or a recognized all-items date amendment can commit.
 * A leading "sim" must never silently discard an edit, exception or negation. */
export function importDecision(message:string) {
  const s=message.normalize("NFD").replace(/\p{Diacritic}/gu,"").toLowerCase().trim();
  if (/^(?:nao|no|cancela[r]?|cancelar tudo|deixa pra la|desisto)[.! ]*$/.test(s)) return "cancel";
  if (/^(?:sim|si|confirmo|pode (?:gravar|registrar|salvar)|ok)[.! ]*$/.test(s)) return "confirm";
  if (/^(?:(?:sim|si|ok|confirmo)[.,! ]+)?(?:tod[oa]s?(?: (?:el[ae]s|as (?:despesas|movimentacoes)|os itens))?\s+)?(?:para|pra|pro|no dia|em|en|el dia)\s+(?:(?:o|el|dia|mes|de)\s+)*(?:\d{1,2}\/\d{1,2}\/\d{4}|(?:\d{1,2} de )?[a-z]+ (?:de )?20\d{2})[.! ]*$/.test(s)) return "date";
  return "clarify";
}
