// Guarda o clique do anúncio (fbclid + UTMs) para a pessoa continuar rastreável
// mesmo se ela sair da landing, voltar depois ou abrir o checkout em outra página.
// Regra: vale o último clique (last-touch) e a lembrança dura 90 dias.

export const ATTRIBUTION_KEYS = [
  "fbclid",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
] as const;

export const ATTRIBUTION_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export type Attribution = { params: Record<string, string>; savedAt: number };

export function pickAttribution(search: string): Record<string, string> {
  const source = new URLSearchParams(search);
  const params: Record<string, string> = {};
  for (const key of ATTRIBUTION_KEYS) {
    const value = source.get(key)?.trim();
    if (value) params[key] = value.slice(0, 256);
  }
  return params;
}

export function isAttribution(value: unknown): value is Attribution {
  if (!value || typeof value !== "object") return false;
  const { params, savedAt } = value as Partial<Attribution>;
  return (
    typeof savedAt === "number" &&
    !!params &&
    typeof params === "object" &&
    Object.values(params).every(item => typeof item === "string")
  );
}

/** Junta o que já foi guardado com o que veio na URL atual. */
export function mergeAttribution(
  stored: Attribution | null,
  search: string,
  now: number,
): Attribution | null {
  const fresh = pickAttribution(search);
  if (Object.keys(fresh).length > 0) return { params: fresh, savedAt: now };
  return stored && now - stored.savedAt < ATTRIBUTION_TTL_MS ? stored : null;
}

/** A URL atual manda; o que falta nela é completado com o clique guardado. */
export function searchFromAttribution(current: string, attribution: Attribution | null): string {
  const result = new URLSearchParams(current);
  if (attribution) {
    for (const [key, value] of Object.entries(attribution.params)) {
      if (!result.has(key)) result.set(key, value);
    }
  }
  return result.toString();
}

/** Formato do cookie _fbc da Meta: fb.<índice do subdomínio>.<criação em ms>.<fbclid>. */
export function fbcFromFbclid(fbclid: string, now: number): string {
  return `fb.1.${now}.${fbclid}`;
}
