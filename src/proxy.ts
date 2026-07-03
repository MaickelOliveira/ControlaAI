import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "controlaai-secret-2026-change-in-prod"
);

async function getRole(token?: string): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return (payload as Record<string, unknown>).role as string ?? "client";
  } catch { return null; }
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get("ca_session")?.value;
  const role = await getRole(token);

  // Proteção /admin/*
  if (pathname.startsWith("/admin") && pathname !== "/admin/login") {
    if (role !== "admin") return NextResponse.redirect(new URL("/admin/login", req.url));
  }

  // Proteção /dashboard/*
  if (pathname.startsWith("/dashboard")) {
    if (!role) return NextResponse.redirect(new URL("/login", req.url));
    if (role === "admin") return NextResponse.redirect(new URL("/admin", req.url));
  }

  // Raiz: redireciona conforme role
  if (pathname === "/") {
    if (role === "admin") return NextResponse.redirect(new URL("/admin", req.url));
    if (role === "client") return NextResponse.redirect(new URL("/dashboard", req.url));
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Bloqueia /admin/login se já logado como admin
  if (pathname === "/admin/login" && role === "admin") {
    return NextResponse.redirect(new URL("/admin", req.url));
  }

  // Bloqueia /login e /cadastro se já logado como client
  if ((pathname === "/login" || pathname === "/cadastro") && role === "client") {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/admin/:path*", "/dashboard/:path*", "/login", "/cadastro"],
};
