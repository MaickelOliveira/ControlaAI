import type { BankOverview } from "./open-finance-display";

export function asksForManualAndBankAccounts(message: string): boolean {
  const text = message.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return /\b(?:contas|cuentas)\b/.test(text)
    && /\b(?:manuais|manual(?:mente)?|manuales)\b/.test(text)
    && /\b(?:bancos?|bancarias?|bancarios?)\b/.test(text)
    && /\b(?:mostr\w*|list\w*|quais|cuales|separ\w*|ver)\b/.test(text);
}

export function separatedAccountList(
  manual: ReadonlyArray<{name:string;isDefault?:boolean}>,
  overview: Pick<BankOverview,"connections"> | null,
  mode: "personal" | "business",
  bankReadFailed = false,
  locale = "pt-BR",
): string {
  const spanish = locale === "es";
  const safe = (value:string) => value.replace(/[\r\n*`_~<>]/g," ").trim().slice(0,100);
  const manualLines = manual.map((account,index)=>`${index+1}. ${safe(account.name)}${account.isDefault?" ⭐":""}`);
  const banks = [...new Set((overview?.connections ?? [])
    .filter(connection=>connection.status==="active"&&!connection.archived_at)
    .map(connection=>safe(connection.institution_name)).filter(Boolean))];
  const bankLines = bankReadFailed ? [spanish?"No pude consultar los bancos ahora.":"Não consegui consultar os bancos agora."]
    : overview === null ? [spanish?"La consulta bancaria no está disponible en este modo.":"A consulta bancária não está disponível neste modo."]
    : banks.length ? banks.map((name,index)=>`${index+1}. ${name}`) : [spanish?"No recibí ningún banco activo en este modo.":"Nenhum banco ativo recebido neste modo."];
  return `🏦 *${spanish?"Cuentas":"Contas"} · ${mode==="business"?"Empresa":spanish?"Personal":"Pessoal"}*\n\n*${spanish?"Cuentas registradas manualmente":"Contas cadastradas manualmente"}*\n${manualLines.join("\n")||(spanish?"Ninguna cuenta manual registrada.":"Nenhuma conta manual cadastrada.")}\n\n*Bancos conectados*\n${bankLines.join("\n")}`;
}
