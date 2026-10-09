import { cookies } from "next/headers";
import Panel from "@/app/admin/polp-sandbox/page";
import { COOKIE, validSession } from "../access";
import Login from "./login";

export default async function Page() {
  if (!validSession((await cookies()).get(COOKIE)?.value)) return <Login />;
  return <>
    <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
      <strong>Instalação isolada.</strong> Sem banco de clientes, WhatsApp, lembretes ou gravação de lançamentos.
    </div>
    <Panel />
  </>;
}
