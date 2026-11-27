import { NextRequest, NextResponse } from "next/server";
import { sendMetaPageView } from "@/lib/meta-conversions";
import { pageViewHosts, parsePageViewBody } from "@/lib/meta-pageview";
import { getRequestIp } from "@/lib/request-ip";

// Visita registrada também pelo servidor: continua contando quando o Pixel do
// navegador é bloqueado (bloqueador de anúncios, Safari, navegadores privados).
// A origem já é conferida pelo proxy; aqui só há validação do corpo e um freio
// simples por IP (por instância — suficiente contra rajadas).
const MAX_BODY_BYTES = 2_000;
const MAX_PER_MINUTE = 30;
const hits = new Map<string, { count: number; resetAt: number }>();

function withinLimit(ip: string, now = Date.now()): boolean {
  if (hits.size > 5_000) {
    for (const [key, entry] of hits) if (entry.resetAt <= now) hits.delete(key);
  }
  const entry = hits.get(ip);
  if (!entry || entry.resetAt <= now) {
    hits.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  entry.count += 1;
  return entry.count <= MAX_PER_MINUTE;
}

export async function POST(req: NextRequest) {
  // Quem desativou a medição não é enviado ao servidor também.
  if (req.cookies.get("zelo_meta_consent")?.value === "denied") {
    return new NextResponse(null, { status: 204 });
  }

  const ip = getRequestIp(req);
  if (!withinLimit(ip)) return new NextResponse(null, { status: 429 });

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return new NextResponse(null, { status: 413 });

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  const body = parsePageViewBody(json, pageViewHosts());
  if (!body) return new NextResponse(null, { status: 400 });

  // Os cookies primários chegam junto com a requisição: servem de reserva quando o
  // navegador ainda não tinha lido _fbp/_fbc no momento do envio.
  const cookie = (name: string) => req.cookies.get(name)?.value;
  const fallback = parsePageViewBody({ eventId: body.eventId, url: body.url, fbp: cookie("_fbp"), fbc: cookie("_fbc"), externalId: cookie("zelo_vid") }, pageViewHosts());
  await sendMetaPageView({
    eventName: body.eventName,
    eventId: body.eventId,
    eventSourceUrl: body.url,
    clientIp: ip,
    userAgent: req.headers.get("user-agent") ?? undefined,
    fbp: body.fbp ?? fallback?.fbp,
    fbc: body.fbc ?? fallback?.fbc,
    externalId: body.externalId ?? fallback?.externalId,
  });
  return new NextResponse(null, { status: 204 });
}
