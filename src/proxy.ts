import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "controlaai-secret-2026-change-in-prod"
);

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/dashboard")) {
    const token = req.cookies.get("ca_session")?.value;
    if (!token) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    try {
      await jwtVerify(token, SECRET);
    } catch {
      return NextResponse.redirect(new URL("/login", req.url));
    }
  }

  // Redireciona raiz para login se não logado
  if (pathname === "/") {
    const token = req.cookies.get("ca_session")?.value;
    if (token) {
      try {
        await jwtVerify(token, SECRET);
        return NextResponse.redirect(new URL("/dashboard", req.url));
      } catch { /* não logado */ }
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/dashboard/:path*"],
};
