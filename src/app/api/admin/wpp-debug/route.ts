import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { wppServer, wppSecretKey, wppSession } = await req.json();
  const b = (wppServer || "").replace(/\/$/, "");
  const secret = wppSecretKey || "";
  const s = wppSession || "controlaai";

  const formats = [
    { label: "POST /api/{secret}/generate-token/{session}", url: `${b}/api/${secret}/generate-token/${s}`, method: "POST" },
    { label: "POST /api/{session}/{secret}/generate-token", url: `${b}/api/${s}/${secret}/generate-token`, method: "POST" },
    { label: "POST /api/{secret}/{session}/generate-token", url: `${b}/api/${secret}/${s}/generate-token`, method: "POST" },
    { label: "GET  /api/{secret}/generate-token/{session}", url: `${b}/api/${secret}/generate-token/${s}`, method: "GET" },
  ];

  const results = [];
  for (const f of formats) {
    try {
      const res = await fetch(f.url, {
        method: f.method,
        headers: f.method === "POST" ? { "Content-Type": "application/json" } : {},
        body: f.method === "POST" ? JSON.stringify({}) : undefined,
        signal: AbortSignal.timeout(8_000),
      });
      const text = await res.text();
      results.push({ label: f.label, url: f.url, status: res.status, body: text.slice(0, 300) });
    } catch (e) {
      results.push({ label: f.label, url: f.url, status: "ERROR", body: String(e) });
    }
  }

  return NextResponse.json({ results });
}
