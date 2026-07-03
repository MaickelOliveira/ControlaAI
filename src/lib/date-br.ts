const TZ = "America/Sao_Paulo";

export function nowBR(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: TZ }));
}

export function todayStrBR(): string {
  return nowBR().toISOString().slice(0, 10);
}

export function nowISOBR(): string {
  const d = nowBR();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function formatDateBR(iso: string): string {
  return new Date(iso + (iso.includes("T") ? "" : "T12:00:00")).toLocaleDateString("pt-BR", { timeZone: TZ });
}

export function formatDateTimeBR(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function monthLabelBR(): string {
  return nowBR().toLocaleDateString("pt-BR", { timeZone: TZ, month: "long", year: "numeric" });
}
