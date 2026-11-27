import { isMetaPublicPath } from "./meta-tracking-config";

export type MirroredEventName = "PageView" | "ViewContent";
export type PageViewBody = { eventId: string; url: string; fbp?: string; fbc?: string; eventName: MirroredEventName; externalId?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FBP = /^fb\.\d\.\d{10,13}\.\d{5,20}$/;
const FBC = /^fb\.\d\.\d{10,13}\.[\w-]{8,300}$/;

/** Hosts em que o site pode se identificar. Serve para o endpoint público não
 *  aceitar PageView de páginas que não são da Zelo. */
export function pageViewHosts(env: NodeJS.ProcessEnv = process.env): string[] {
  const hosts = new Set(["zelogestaointeligente.com.br", "www.zelogestaointeligente.com.br", "localhost"]);
  for (const value of [env.APP_ORIGIN, env.NEXT_PUBLIC_APP_URL, env.OPEN_FINANCE_APP_ORIGIN]) {
    try {
      if (value) hosts.add(new URL(value).hostname);
    } catch {
      // variável mal preenchida: ignora e segue com os demais
    }
  }
  return [...hosts];
}

/** Valida o corpo enviado pelo navegador. Retorna null se algo não bate. */
export function parsePageViewBody(body: unknown, allowedHosts: string[]): PageViewBody | null {
  if (!body || typeof body !== "object") return null;
  const { eventId, url, fbp, fbc, eventName = "PageView", externalId } = body as Record<string, unknown>;
  if (typeof eventId !== "string" || !UUID.test(eventId)) return null;
  // Só eventos de navegação passam por aqui; compra e checkout vêm da Hotmart.
  if (eventName !== "PageView" && eventName !== "ViewContent") return null;
  if (typeof url !== "string" || url.length > 600) return null;

  let page: URL;
  try {
    page = new URL(url);
  } catch {
    return null;
  }
  if (page.protocol !== "https:" && page.protocol !== "http:") return null;
  if (!allowedHosts.includes(page.hostname)) return null;
  if (!isMetaPublicPath(page.pathname)) return null;
  page.hash = "";

  return {
    eventId,
    url: page.toString(),
    // _fbp/_fbc malformados são descartados em vez de derrubar o evento inteiro.
    fbp: typeof fbp === "string" && FBP.test(fbp) ? fbp : undefined,
    fbc: typeof fbc === "string" && FBC.test(fbc) ? fbc : undefined,
    eventName,
    externalId: typeof externalId === "string" && UUID.test(externalId) ? externalId : undefined,
  };
}
