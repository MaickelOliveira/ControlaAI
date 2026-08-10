import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

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

  // Lê os dois cookies independentemente
  const clientToken = req.cookies.get(CLIENT_COOKIE)?.value;
  const adminToken  = req.cookies.get(ADMIN_COOKIE)?.value;
  const clientRole  = await getRole(clientToken);
  const adminRole   = await getRole(adminToken);

  // ── Proteção /admin/* (exige cookie de admin)
  if (pathname.startsWith("/admin") && pathname !== "/admin/login") {
    if (adminRole !== "admin") return NextResponse.redirect(new URL("/admin/login", req.url));
  }

  // ── Proteção /dashboard/* (exige cookie de cliente)
  if (pathname.startsWith("/dashboard")) {
    if (clientRole !== "client") return NextResponse.redirect(new URL("/login", req.url));
  }

  // ── A landing page é sempre pública, inclusive para quem está logado.
  // Cliente e admin usam cookies separados e podem manter as duas sessões no
  // mesmo navegador sem a raiz escolher um painel e trocar o contexto.
  if (pathname === "/") {
    return NextResponse.next();
  }

  // ── Não deixa admin já logado ver /admin/login
  if (pathname === "/admin/login" && adminRole === "admin") {
    return NextResponse.redirect(new URL("/admin", req.url));
  }

  // ── Não deixa cliente já logado ver /login ou /cadastro
  if ((pathname === "/login" || pathname === "/cadastro") && clientRole === "client") {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/admin/:path*", "/dashboard/:path*", "/login", "/cadastro"],
};
