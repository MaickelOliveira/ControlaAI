"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useSyncExternalStore } from "react";
import {
  isMetaPublicPath,
  isMetaRegistrationPath,
  metaCheckoutCurrency,
} from "@/lib/meta-tracking-config";

const CONSENT_KEY = "zelo_meta_consent";
const CONSENT_CHANGED = "zelo:meta-consent-changed";

type Consent = "granted" | "denied" | null;
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
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(CONSENT_KEY);
    return value === "granted" || value === "denied" ? value : null;
  } catch {
    return null;
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
  return useSyncExternalStore(subscribeToConsent, getStoredConsent, () => null);
}

function setStoredConsent(value: Exclude<Consent, null>) {
  try {
    window.localStorage.setItem(CONSENT_KEY, value);
  } catch {
    return;
  }
  document.cookie = `${CONSENT_KEY}=${value}; Max-Age=15552000; Path=/; SameSite=Lax; Secure`;
  if (value === "denied") {
    window.fbq?.("consent", "revoke");
    for (const cookie of ["_fbp", "_fbc"]) {
      document.cookie = `${cookie}=; Max-Age=0; Path=/; SameSite=Lax; Secure`;
    }
  }
  window.dispatchEvent(new Event(CONSENT_CHANGED));
}

const consentCopy = {
  "pt-BR": {
    title: "Medição de anúncios",
    description: "Se você permitir, o Pixel da Meta poderá medir visitas e cliques para assinar nas páginas públicas da Zelo. A escolha também controla o envio do identificador de clique da Meta ao checkout da Hotmart. Você pode desativar essa medição a qualquer momento. O site continua usando cookies de sessão para manter seu acesso.",
    allow: "Permitir medição de anúncios",
    disable: "Desativar medição de anúncios",
  },
  "pt-PT": {
    title: "Medição de anúncios",
    description: "Se autorizares, o Pixel da Meta pode medir visitas e cliques para subscrever nas páginas públicas da Zelo. A escolha também controla o envio do identificador de clique da Meta para a página de pagamento da Hotmart. Podes desativar esta medição a qualquer momento. O site continua a utilizar cookies de sessão para manter o teu acesso.",
    allow: "Permitir medição de anúncios",
    disable: "Desativar medição de anúncios",
  },
  es: {
    title: "Medición de anuncios",
    description: "Si lo permites, el píxel de Meta podrá medir visitas y clics para suscribirse en las páginas públicas de Zelo. Tu elección también controla el envío del identificador de clic de Meta a la página de pago de Hotmart. Puedes desactivar esta medición en cualquier momento. El sitio sigue usando cookies de sesión para mantener tu acceso.",
    allow: "Permitir la medición de anuncios",
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

export default function MetaTracking() {
  const pathname = usePathname();
  const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID || "1673074203783828";
  const isPublicPage = isMetaPublicPath(pathname);
  const consent = useMetaConsent();
  const initialized = useRef(false);
  const previousPath = useRef(pathname);

  useEffect(() => {
    if (!pixelId || consent !== "granted" || !isPublicPage) {
      window.fbq?.("consent", "revoke");
      return;
    }

    const fbq = installMetaQueue();
    fbq("consent", "grant");
    if (!initialized.current) {
      fbq("init", pixelId);
      fbq("set", "autoConfig", false, pixelId);
      fbq("track", "PageView");
      initialized.current = true;
      previousPath.current = pathname;
      return;
    }

    if (previousPath.current !== pathname) {
      fbq("track", "PageView");
      previousPath.current = pathname;
    }
  }, [consent, isPublicPage, pathname, pixelId]);

  useEffect(() => {
    if (!pixelId || consent !== "granted" || !isPublicPage) return;

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
  }, [consent, isPublicPage, pathname, pixelId]);

  if (!pixelId || !isPublicPage || consent !== "granted") return null;

  return (
    <Script
      id="meta-pixel"
      src="https://connect.facebook.net/en_US/fbevents.js"
      strategy="afterInteractive"
    />
  );
}
