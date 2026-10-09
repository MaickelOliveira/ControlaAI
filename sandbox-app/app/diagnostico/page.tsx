import { cookies } from "next/headers";
import Link from "next/link";
import Panel from "@/app/admin/polp-sandbox/page";
import { COOKIE, validSession } from "../../access";
import Login from "../login";

export default async function Page() {
  if (!validSession((await cookies()).get(COOKIE)?.value)) return <Login />;
  return <main className="mx-auto max-w-6xl p-6 md:p-10"><Link className="mb-5 inline-block text-sm font-semibold text-indigo-700" href="/">← Voltar à prévia do cliente</Link><Panel /></main>;
}
