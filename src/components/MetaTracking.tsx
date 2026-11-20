"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useSyncExternalStore } from "react";
import {
  DEFAULT_META_PIXEL_ID,
  isMetaPublicPath,
  isMetaRegistrationPath,
  metaCheckoutCurrency,
} from "@/lib/meta-tracking-config";
import {
  fbcFromFbclid,
  isAttribution,
  mergeAttribution,
  searchFromAttribution,
  type Attribution,
} from "@/lib/meta-attribution";

const CONSENT_KEY = "zelo_meta_consent";
const CONSENT_CHANGED = "zelo:meta-consent-changed";
const ATTRIBUTION_KEY = "zelo_attribution";
const COOKIE_MAX_AGE = 90 * 24 * 60 * 60;

// A medição vem LIGADA: a pessoa só deixa de ser medida se escolher desativar
// (botão na página de Privacidade). Antes ela só ligava depois de um "permitir"
// explícito — e como o aviso de cookies saiu das páginas de venda, ninguém mais
// permitia e as visitas deixaram de ser contadas.
const DEFAULT_CONSENT = "granted" as const;

type Consent = "granted" | "denied";
type MetaParameters = Record<string, string | number | boolean | string[]>;
type MetaPixel = {
  (...args: unknown[]): void;
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[][];
  loaded: boolean;
  version: string;
  push: MetaPixel;
};

declare global {
  interface Window {
    fbq?: MetaPixel;
    _fbq?: MetaPixel;
  }
}

function getStoredConsent(): Consent {
  if (typeof window === "undefined") return DEFAULT_CONSENT;
  try {
    const value = window.localStorage.getItem(CONSENT_KEY);
    return value === "granted" || value === "denied" ? value : DEFAULT_CONSENT;
  } catch {
    return DEFAULT_CONSENT;
  }
}

function subscribeToConsent(listener: () => void) {
  window.addEventListener(CONSENT_CHANGED, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(CONSENT_CHANGED, listener);
    window.removeEventListener("storage", listener);
  };
}

function useMetaConsent() {
  return useSyncExternalStore(subscribeToConsent, getStoredConsent, () => DEFAULT_CONSENT);
}

function useIsClient() {
  return useSyncExternalStore(() => () => {}, () => true, () => false);
}

function expireCookie(name: string) {
  document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax; Secure`;
}

function readCookie(name: string): string | undefined {
  const match = document.cookie.split("; ").find(item => item.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : undefined;
}

function setStoredConsent(value: Consent) {
  try {
    window.localStorage.setItem(CONSENT_KEY, value);
  } catch {
    return;
  }
  document.cookie = `${CONSENT_KEY}=${value}; Max-Age=15552000; Path=/; SameSite=Lax; Secure`;
  if (value === "denied") {
    window.fbq?.("consent", "revoke");
    for (const cookie of ["_fbp", "_fbc"]) expireCookie(cookie);
    try {
      window.localStorage.removeItem(ATTRIBUTION_KEY);
    } catch {
      // sem acesso ao armazenamento: nada a apagar
    }
  }
  window.dispatchEvent(new Event(CONSENT_CHANGED));
}

const consentCopy = {
  "pt-BR": {
    title: "Medição de anúncios",
    description: "O Pixel da Meta mede visitas e cliques para assinar nas páginas públicas da Zelo, para sabermos quais anúncios funcionam. A medição também envia o identificador de clique da Meta ao checkout da Hotmart. Você pode desativá-la aqui a qualquer momento. O site continua usando cookies de sessão para manter seu acesso.",
    allow: "Reativar medição de anúncios",
    disable: "Desativar medição de anúncios",
  },
  "pt-PT": {
    title: "Medição de anúncios",
    description: "O Pixel da Meta mede visitas e cliques para subscrever nas páginas públicas da Zelo, para sabermos quais os anúncios que funcionam. A medição também envia o identificador de clique da Meta para a página de pagamento da Hotmart. Podes desativá-la aqui a qualquer momento. O site continua a utilizar cookies de sessão para manter o teu acesso.",
    allow: "Reativar medição de anúncios",
    disable: "Desativar medição de anúncios",
  },
  es: {
    title: "Medición de anuncios",
    description: "El píxel de Meta mide visitas y clics para suscribirse en las páginas públicas de Zelo, para saber qué anuncios funcionan. La medición también envía el identificador de clic de Meta a la página de pago de Hotmart. Puedes desactivarla aquí en cualquier momento. El sitio sigue usando cookies de sesión para mantener tu acceso.",
    allow: "Reactivar la medición de anuncios",
    disable: "Desactivar la medición de anuncios",
  },
};

export function CookiePreferences({ locale }: { locale: keyof typeof consentCopy }) {
  const enabled = useMetaConsent() === "granted";
  const copy = consentCopy[locale];

  return (
    <section id="cookies" aria-labelledby="cookies-title">
      <h2 id="cookies-title" className="text-xl font-bold text-slate-900">{copy.title}</h2>
      <p className="mt-3 leading-7 text-slate-600">{copy.description}</p>
      <button
        type="button"
        className="mt-4 min-h-11 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-50"
        onClick={() => setStoredConsent(enabled ? "denied" : "granted")}
      >
        {enabled ? copy.disable : copy.allow}
      </button>
    </section>
  );
}

function installMetaQueue(): MetaPixel {
  if (window.fbq) return window.fbq;

  const fbq = function (...args: unknown[]) {
    if (fbq.callMethod) fbq.callMethod(...args);
    else fbq.queue.push(args);
  } as MetaPixel;
  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = "2.0";
  fbq.queue = [];
  window.fbq = fbq;
  window._fbq = fbq;
  return fbq;
}

export function hasMetaConsent() {
  return getStoredConsent() === "granted";
}

function readAttribution(): Attribution | null {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(ATTRIBUTION_KEY) || "null");
    return isAttribution(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Guarda o clique do anúncio (fbclid/UTMs) e, se faltar, cria o cookie _fbc —
 *  assim a pessoa continua ligada ao anúncio mesmo que o Pixel demore a carregar. */
function rememberAttribution() {
  const now = Date.now();
  const next = mergeAttribution(readAttribution(), window.location.search, now);
  try {
    if (next) window.localStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(next));
    else window.localStorage.removeItem(ATTRIBUTION_KEY);
  } catch {
    // armazenamento bloqueado: a URL atual ainda vale
  }
  const fbclid = next?.params.fbclid;
  if (fbclid && !readCookie("_fbc")) {
    document.cookie = `_fbc=${fbcFromFbclid(fbclid, next.savedAt)}; Max-Age=${COOKIE_MAX_AGE}; Path=/; SameSite=Lax; Secure`;
  }
}

/** Parâmetros da URL atual completados com o último clique de anúncio guardado.
 *  Usado ao montar o link do checkout da Hotmart. */
export function landingSearchWithAttribution(): string {
  return searchFromAttribution(window.location.search, hasMetaConsent() ? readAttribution() : null);
}

export function trackMetaEvent(
  name: string,
  parameters: MetaParameters = {},
  eventId?: string,
  custom = false,
) {
  if (!hasMetaConsent() || !window.fbq) return;
  const options = eventId ? { eventID: eventId } : undefined;
  window.fbq(custom ? "trackCustom" : "track", name, parameters, options);
}

/** PageView no navegador + o mesmo evento (mesmo event_id) pelo servidor, que
 *  continua contando quando o Pixel é bloqueado. A espera dá tempo ao Pixel de
 *  criar o cookie _fbp antes de ele ser lido. */
function trackPageView(fbq: MetaPixel) {
  const eventId = crypto.randomUUID();
  fbq("track", "PageView", {}, { eventID: eventId });
  window.setTimeout(() => {
    if (!hasMetaConsent()) return;
    void fetch("/api/meta/pageview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        eventId,
        url: window.location.href,
        fbp: readCookie("_fbp"),
        fbc: readCookie("_fbc"),
      }),
    }).catch(() => {});
  }, 1500);
}

export default function MetaTracking() {
  const pathname = usePathname();
  const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID || DEFAULT_META_PIXEL_ID;
  const isPublicPage = isMetaPublicPath(pathname);
  const consent = useMetaConsent();
  const isClient = useIsClient();
  const initialized = useRef(false);
  const previousPath = useRef(pathname);

  useEffect(() => {
    // Na hidratação o React ainda usa o consentimento padrão do servidor; só
    // agimos depois de ler a escolha real da pessoa (isClient).
    if (!isClient) return;
    if (!pixelId || consent !== "granted" || !isPublicPage) {
      window.fbq?.("consent", "revoke");
      return;
    }

    rememberAttribution();
    const fbq = installMetaQueue();
    fbq("consent", "grant");
    if (!initialized.current) {
      fbq("init", pixelId);
      fbq("set", "autoConfig", false, pixelId);
      trackPageView(fbq);
      initialized.current = true;
      previousPath.current = pathname;
      return;
    }

    if (previousPath.current !== pathname) {
      trackPageView(fbq);
      previousPath.current = pathname;
    }
  }, [consent, isClient, isPublicPage, pathname, pixelId]);

  useEffect(() => {
    if (!isClient || !pixelId || consent !== "granted" || !isPublicPage) return;

    const handleClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!target) return;
      const url = new URL(target.href, window.location.href);
      const isRegistration = url.origin === window.location.origin && isMetaRegistrationPath(url.pathname);
      const isHotmartCheckout = url.hostname === "pay.hotmart.com";
      if (!isRegistration && !isHotmartCheckout) return;
      if (isHotmartCheckout) {
        trackMetaEvent("InitiateCheckout", {
          content_name: "Plano Zelo",
          content_category: "subscription",
          plan: target.dataset.metaPlan || "not_selected",
          currency: metaCheckoutCurrency(pathname),
          value: Number(target.dataset.metaValue || 0),
        }, crypto.randomUUID());
        return;
      }
      trackMetaEvent("StartRegistration", {
        plan: url.searchParams.get("plan") || "not_selected",
        billing_cycle: url.searchParams.get("cycle") || "not_selected",
      }, crypto.randomUUID(), true);
    };

    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [consent, isClient, isPublicPage, pathname, pixelId]);

  if (!pixelId || !isClient || !isPublicPage || consent !== "granted") return null;

  return (
    <Script
      id="meta-pixel"
      src="https://connect.facebook.net/en_US/fbevents.js"
      strategy="afterInteractive"
    />
  );
}
