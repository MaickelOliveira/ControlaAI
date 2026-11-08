import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { getBankInstitutions } from "@/lib/open-finance-institutions";
import BankCatalogue, { type CatalogueEntry } from "./BankCatalogue";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Catálogo de bancos do Open Finance | Zelo",
  description: "Pesquise as instituições do Open Finance para conectar uma conta pessoal ou empresarial à Zelo.",
};

async function Institutions() {
  let entries: CatalogueEntry[];
  try {
    const banks = await getBankInstitutions();
    entries = banks
      .map(({ id, name, type, status, is_outage }) => ({
        id, name, type, available: status === "OPERATIONAL" && !is_outage,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  } catch {
    return (
      <div role="status" className="space-y-3">
        <p>O catálogo de bancos está temporariamente indisponível.</p>
        <form action="/bancos" method="get">
          <button className="cursor-pointer rounded-xl bg-[#fec307] px-4 py-3 font-semibold">Tentar novamente</button>
        </form>
      </div>
    );
  }
  return <BankCatalogue entries={entries} />;
}

export default function BanksPage() {
  return (
    <main className="min-h-dvh bg-[#fffbef] px-4 pb-12 text-[#20241f] sm:px-8">
      <div className="mx-auto max-w-4xl">
        <header className="flex items-center justify-between gap-4 border-b border-[#dedbcf] py-5">
          <Link href="/" aria-label="Zelo, início"><Image src="/brand/zelo-icon.png" alt="" width={44} height={44} /></Link>
          <Link href="/#open-finance" className="rounded font-semibold underline underline-offset-4">Voltar à apresentação</Link>
        </header>
        <h1 className="mt-10 text-4xl font-bold tracking-tight sm:mt-16 sm:text-5xl">Catálogo de bancos</h1>
        <p className="mt-3 max-w-xl text-[#55594e]">Consulte as opções de Open Finance para sua conta pessoal ou empresa.</p>
        <section aria-label="Pesquisar instituições" className="mt-7 rounded-3xl border border-[#dedbcf] bg-white p-4 sm:p-7">
          <Suspense fallback={<p role="status">Consultando o catálogo…</p>}>
            <Institutions />
          </Suspense>
        </section>
        <footer className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-[#55594e]">
          <a className="underline underline-offset-4" href="https://api.polp.com.br/api/v2/institutions" target="_blank" rel="noopener noreferrer">Fonte técnica da Polp (JSON)</a>
          <Link className="underline underline-offset-4" href="/privacidade#open-finance">Como seus dados bancários são usados</Link>
        </footer>
      </div>
    </main>
  );
}
