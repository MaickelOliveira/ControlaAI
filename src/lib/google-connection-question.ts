export type GoogleConnectionQuestion = { mode?: "personal" | "business"; ambiguous: boolean };

/** Recognize status questions, leaving connection and calendar actions alone. */
export function googleConnectionQuestion(message: string): GoogleConnectionQuestion | null {
  const text = message.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/\b(?:drive|google one|gmail|fotos|photos)\b/.test(text) && !/\b(?:calendario|calendar|meet)\b/.test(text)) return null;
  if (!/\b(?:google|calendario|calendar|meet)\b/.test(text)) return null;
  if (!/\b(?:conectad[oa]s?|vinculad[oa]s?|integrado|integrada|autorizad[oa]s?|ativ[oa]s?)\b/.test(text)) return null;
  if (!/\b(?:esta|estao|ha|tem|existe|status|situacao|verifi\w*|confir\w*|expli\w*|qual|se)\b/.test(text) && !message.includes("?")) return null;
  const personal = /\b(?:pessoal|personal|pf)\b/.test(text);
  const business = /\b(?:empresa|empresarial|pj)\b/.test(text);
  return { mode: personal !== business ? (personal ? "personal" : "business") : undefined, ambiguous: personal && business };
}
