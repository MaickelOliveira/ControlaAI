import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "controlaai-secret-2026-change-in-prod"
);

const CLIENT_COOKIE = "ca_session";
const ADMIN_COOKIE  = "ca_admin";

async function getRole(token?: string): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET);
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

  // ── Raiz: redireciona para o dashboard relevante (cliente tem prioridade)
  if (pathname === "/") {
    if (clientRole === "client") return NextResponse.redirect(new URL("/dashboard", req.url));
    if (adminRole === "admin") return NextResponse.redirect(new URL("/admin", req.url));
    return NextResponse.redirect(new URL("/login", req.url));
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
