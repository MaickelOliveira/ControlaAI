import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { isSameOrigin } from "./lib/request-origin";

// Cópia própria da verificação de JWT (não dá pra importar auth.ts aqui —
// esse arquivo roda no Edge Runtime, que não tem acesso a fs, e auth.ts
// agora importa users.ts). Mesma regra de segurança: sem JWT_SECRET
// configurado, trata como deslogado (nega acesso) em vez de aceitar
// qualquer token assinado com uma chave pública conhecida.
function getSecret(): Uint8Array | null {
  if (!process.env.JWT_SECRET) return null;
  return new TextEncoder().encode(process.env.JWT_SECRET);
}

const CLIENT_COOKIE = "ca_session";
const ADMIN_COOKIE  = "ca_admin";

async function getRole(token?: string): Promise<string | null> {
  if (!token) return null;
  const secret = getSecret();
  if (!secret) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    return (payload as Record<string, unknown>).role as string ?? "client";
  } catch { return null; }
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Session API writes are accepted only from the same website. Webhooks and
  // cron authenticate independently through their signatures/service secrets.
  if (pathname.startsWith("/api/") && !/^\/api\/(?:webhook|cron)(?:\/|$)/.test(pathname)) {
    const expectedOrigin = process.env.APP_ORIGIN || process.env.OPEN_FINANCE_APP_ORIGIN;
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && ((process.env.NODE_ENV === "production" && !expectedOrigin) || !isSameOrigin(req,expectedOrigin))) {
      return NextResponse.json({error:"Origem não autorizada"},{status:403,headers:{"Cache-Control":"private, no-store"}});
    }
    return NextResponse.next();
  }

  // Lê os dois cookies independentemente
  const clientToken = req.cookies.get(CLIENT_COOKIE)?.value;
  const adminToken  = req.cookies.get(ADMIN_COOKIE)?.value;
  const clientRole  = await getRole(clientToken);
  const adminRole   = await getRole(adminToken);

  // ── Proteção /admin/* (exige cookie de admin)
  if (pathname.startsWith("/admin") && pathname !== "/admin/login") {
    if (adminRole !== "admin") return NextResponse.redirect(new URL("/admin/login", req.url));
  }

  // ── Proteção /dashboard/*, /es/dashboard/* e /pt/dashboard/* (exige
  // cookie de cliente) — cada árvore de idioma manda pro login do mesmo
  // idioma quando desloga, em vez de sempre cair no /login em português.
  if (pathname.startsWith("/es/dashboard")) {
    if (clientRole !== "client") return NextResponse.redirect(new URL("/es/login", req.url));
  } else if (pathname.startsWith("/pt/dashboard")) {
    if (clientRole !== "client") return NextResponse.redirect(new URL("/pt/login", req.url));
  } else if (pathname.startsWith("/dashboard")) {
    if (clientRole !== "client") return NextResponse.redirect(new URL("/login", req.url));
  }

  // ── A landing page é sempre pública, inclusive para quem está logado.
  // Cliente e admin usam cookies separados e podem manter as duas sessões no
  // mesmo navegador sem a raiz escolher um painel e trocar o contexto.
  // /es e /pt são as mesmas landing pages traduzidas (espanhol e português
  // de Portugal) — mesma regra de sempre pública.
  if (pathname === "/" || pathname === "/es" || pathname === "/pt") {
    return NextResponse.next();
  }

  // Admin credential changes revoke sessions in the API guard. Keep login
  // reachable even when a browser still carries an old, correctly signed JWT.

  // ── Não deixa cliente já logado ver /login ou /cadastro (nas 3 versões
  // de idioma) — agora que o dashboard traduzido existe (Fase 2), manda
  // pro dashboard do mesmo idioma em vez de sempre cair no padrão em pt-BR.
  if (["/es/login", "/es/cadastro"].includes(pathname) && clientRole === "client") {
    return NextResponse.redirect(new URL("/es/dashboard", req.url));
  }
  if (["/pt/login", "/pt/cadastro"].includes(pathname) && clientRole === "client") {
    return NextResponse.redirect(new URL("/pt/dashboard", req.url));
  }
  if (["/login", "/cadastro"].includes(pathname) && clientRole === "client") {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*", "/", "/es", "/pt", "/admin/:path*", "/dashboard/:path*", "/es/dashboard/:path*", "/pt/dashboard/:path*", "/login", "/cadastro", "/es/login", "/es/cadastro", "/pt/login", "/pt/cadastro"],
};
