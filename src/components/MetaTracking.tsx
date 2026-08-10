"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const CONSENT_KEY = "zelo_meta_consent";
const PUBLIC_PATHS = new Set(["/", "/cadastro", "/login"]);

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
  const value = window.localStorage.getItem(CONSENT_KEY);
  return value === "granted" || value === "denied" ? value : null;
}

function setStoredConsent(value: Exclude<Consent, null>) {
  window.localStorage.setItem(CONSENT_KEY, value);
  document.cookie = `${CONSENT_KEY}=${value}; Max-Age=15552000; Path=/; SameSite=Lax; Secure`;
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

export function readBrowserCookie(name: string) {
  if (typeof document === "undefined") return undefined;
  const prefix = `${name}=`;
  const value = document.cookie.split("; ").find(cookie => cookie.startsWith(prefix));
  return value ? decodeURIComponent(value.slice(prefix.length)) : undefined;
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
  const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  const isPublicPage = PUBLIC_PATHS.has(pathname);
  const [consent, setConsent] = useState<Consent | "loading">("loading");
  const initialized = useRef(false);
  const previousPath = useRef(pathname);

  useEffect(() => {
    const timer = window.setTimeout(() => setConsent(getStoredConsent()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!pixelId || consent !== "granted") return;

    if (!isPublicPage) {
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
      const isRegistration = url.origin === window.location.origin && url.pathname === "/cadastro";
      const isHotmartCheckout = url.hostname === "pay.hotmart.com";
      if (!isRegistration && !isHotmartCheckout) return;
      if (isHotmartCheckout) {
        trackMetaEvent("InitiateCheckout", {
          content_name: "Plano Zelo",
          content_category: "subscription",
          plan: target.dataset.metaPlan || "not_selected",
          currency: "BRL",
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
  }, [consent, isPublicPage, pixelId]);

  function chooseConsent(value: Exclude<Consent, null>) {
    setStoredConsent(value);
    setConsent(value);
    if (value === "denied") {
      for (const cookie of ["_fbp", "_fbc"]) {
        document.cookie = `${cookie}=; Max-Age=0; Path=/; SameSite=Lax; Secure`;
      }
    }
  }

  if (!pixelId || !isPublicPage) return null;

  return (
    <>
      {consent === "granted" && (
        <Script
          id="meta-pixel"
          src="https://connect.facebook.net/en_US/fbevents.js"
          strategy="afterInteractive"
        />
      )}

      {consent === null && (
        <aside
          aria-label="Preferências de privacidade"
          className="fixed inset-x-4 bottom-4 z-[100] mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl sm:flex sm:items-center sm:gap-5 sm:p-5"
        >
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-slate-950">Sua privacidade importa</p>
            <p className="mt-1 text-sm leading-5 text-slate-600">
              Com sua permissão, usamos cookies da Meta para medir anúncios e melhorar nossas campanhas. Você pode recusar e continuar usando o site normalmente.
            </p>
          </div>
          <div className="mt-4 flex shrink-0 gap-2 sm:mt-0">
            <button
              type="button"
              onClick={() => chooseConsent("denied")}
              className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Recusar
            </button>
            <button
              type="button"
              onClick={() => chooseConsent("granted")}
              className="rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-amber-400"
            >
              Aceitar
            </button>
          </div>
        </aside>
      )}
    </>
  );
}
