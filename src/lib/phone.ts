import {
  isSupportedCountry,
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js/max";

function supportedCountry(value?: string): CountryCode | undefined {
  const country = value?.trim().toUpperCase();
  return country && isSupportedCountry(country) ? country as CountryCode : undefined;
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

export type PhoneLocale = "pt-BR" | "pt-PT" | "es";

const SPANISH_COUNTRIES = new Set<CountryCode>([
  "AR", "BO", "CL", "CO", "CR", "CU", "DO", "EC", "ES", "GT", "HN",
  "MX", "NI", "PA", "PE", "PR", "PY", "SV", "UY", "VE",
]);

/** Escolhe um único idioma para mensagens enviadas antes de o telefone
 * estar vinculado a uma conta (e, portanto, antes de existir user.locale).
 * +55 sempre é pt-BR; nunca retorna uma mensagem bilíngue. */
export function localeForWhatsAppPhone(value: string): PhoneLocale {
  const digits = digitsOnly(value);
  if (digits.startsWith("55")) return "pt-BR";
  if (digits.startsWith("351")) return "pt-PT";

  const parsed = parsePhoneNumberFromString(value.trim().startsWith("+") ? value : `+${digits}`);
  if (parsed?.country === "BR") return "pt-BR";
  if (parsed?.country === "PT") return "pt-PT";
  if (parsed?.country && SPANISH_COUNTRIES.has(parsed.country)) return "es";

  // Fallback também cobre números incompletos vindos do provedor, para os
  // quais a biblioteca pode não conseguir validar o país.
  if (/^(?:34|52|53|54|56|57|58|591|593|595|598|502|503|504|505|506|507|509)/.test(digits)) return "es";
  return "pt-BR";
}

function parsedNumber(value: string, country?: CountryCode): string | undefined {
  const parsed = parsePhoneNumberFromString(value, country);
  if (!parsed?.isPossible()) return undefined;
  return parsed.number.slice(1);
}

/** Normaliza telefones para o formato internacional E.164 usado pelo
 * WhatsApp (somente dígitos, incluindo o DDI).
 *
 * - números com +DDI ou 00DDI nunca recebem +55 automaticamente;
 * - números recebidos do webhook, que já chegam com DDI mas sem '+', são
 *   reconhecidos globalmente;
 * - quando o checkout envia um número local, o ISO do país permite aplicar
 *   corretamente qualquer DDI, inclusive regras especiais como +54 9 para
 *   celulares argentinos. */
export function normalizeWhatsAppPhone(value: string, countryIso?: string): string {
  const raw = value.trim();
  if (!raw) return "";

  const digits = digitsOnly(raw);
  if (!digits) return "";

  if (raw.startsWith("+")) {
    return parsedNumber(`+${digits}`) ?? digits;
  }

  if (raw.startsWith("00")) {
    const internationalDigits = digits.slice(2);
    return parsedNumber(`+${internationalDigits}`) ?? internationalDigits;
  }

  const country = supportedCountry(countryIso);
  if (country) {
    // Primeiro preserva um número que já contenha o DDI correto.
    const international = parsePhoneNumberFromString(`+${digits}`);
    if (international?.country === country && international.isPossible()) {
      return international.number.slice(1);
    }

    // Caso contrário, interpreta como número nacional do país informado.
    const national = parsedNumber(raw, country);
    if (national) return national;
  }

  // Webhooks do WhatsApp entregam o remetente com DDI e sem sinal de '+'.
  // Reconhece esse formato sem presumir que 10/11 dígitos sejam brasileiros.
  return parsedNumber(`+${digits}`) ?? digits;
}
