"use client";

import { useEffect, useState } from "react";
import type {
  PolpAccount, PolpConsent, PolpInstitution, PolpPage, PolpSnapshot, PolpTransaction,
} from "@/lib/polp-sandbox";
import type { Reconciliation } from "@/lib/polp-reconciliation";

const endpoint = "/api/admin/polp-sandbox";

async function api<T>(query: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${endpoint}${query}`, { cache: "no-store", ...options });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Não foi possível consultar o sandbox.");
  return result as T;
}

function currency(value?: { amount: string; currency: string } | null) {
  if (!value) return "Saldo ainda não sincronizado";
  const number = Number(value.amount);
  return Number.isFinite(number)
    ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: value.currency || "BRL" }).format(number)
    : value.amount;
}

export default function PolpSandboxPage() {
  const [institutions, setInstitutions] = useState<PolpInstitution[]>([]);
  const [nextInstitutions, setNextInstitutions] = useState<string | null>(null);
  const [selectedInstitution, setSelectedInstitution] = useState("");
  const [consents, setConsents] = useState<PolpConsent[]>([]);
  const [selectedConsent, setSelectedConsent] = useState("");
  const [accounts, setAccounts] = useState<PolpAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState("");
  const [transactions, setTransactions] = useState<PolpTransaction[]>([]);
  const [snapshot, setSnapshot] = useState<(PolpSnapshot & { reconciliation: Reconciliation[]; comparedWithZelo: boolean }) | null>(null);
  const [mode, setMode] = useState<"personal" | "business">("personal");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const first = await api<PolpPage<PolpInstitution>>("?action=institutions");
        if (!cancelled) {
          setInstitutions(first.data);
          setNextInstitutions(first.meta?.next_cursor || null);
        }
        const existing = await api<PolpPage<PolpConsent>>("?action=consents");
        if (!cancelled) setConsents(existing.data.filter(item => item.cliente_user_id === "zelo-admin-sandbox"));
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Falha ao carregar o teste.");
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  async function moreInstitutions() {
    if (!nextInstitutions) return;
    setLoading(true); setError("");
    try {
      const page = await api<PolpPage<PolpInstitution>>(`?action=institutions&cursor=${encodeURIComponent(nextInstitutions)}`);
      setInstitutions(items => [...items, ...page.data]);
      setNextInstitutions(page.meta?.next_cursor || null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao listar instituições."); }
    finally { setLoading(false); }
  }

  async function loadAccounts(consentId: string) {
    setLoading(true); setError(""); setNotice("");
    setSelectedConsent(consentId); setSelectedAccount(""); setTransactions([]); setSnapshot(null);
    try {
      const data = await api<PolpSnapshot & { reconciliation: Reconciliation[]; comparedWithZelo: boolean }>(
        `?action=snapshot&consentId=${encodeURIComponent(consentId)}&mode=${mode}`);
      setSnapshot(data); setAccounts(data.accounts);
      if (!data.accounts.length && !data.cards.length) setNotice("A Polp ainda está gerando os dados fictícios. Aguarde um instante e clique em Atualizar.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao consultar contas."); }
    finally { setLoading(false); }
  }

  async function createTest() {
    if (!selectedInstitution) return;
    setLoading(true); setError(""); setNotice("");
    try {
      const created = await api<{ data: PolpConsent }>("", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ institutionId: selectedInstitution }),
      });
      setConsents(items => [created.data, ...items.filter(item => item.id !== created.data.id)]);
      setNotice("Consentimento fictício autorizado. Consultando contas...");
      await loadAccounts(created.data.id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao criar teste."); }
    finally { setLoading(false); }
  }

  async function loadTransactions(accountId: string) {
    setLoading(true); setError(""); setNotice(""); setSelectedAccount(accountId);
    try {
      const page = await api<PolpPage<PolpTransaction>>(`?action=transactions&accountId=${encodeURIComponent(accountId)}`);
      setTransactions(page.data);
      if (!page.data.length) setNotice("As transações fictícias ainda estão sendo sincronizadas. Clique novamente em Ver extrato.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao consultar extrato."); }
    finally { setLoading(false); }
  }

  return (
    <div className="max-w-5xl space-y-6 pb-12">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-green-700">Somente administrador · teste</p>
        <h1 className="text-2xl font-bold text-slate-900">Polp Open Finance · Sandbox</h1>
        <p className="mt-2 text-sm text-slate-600">
          Experimente contas, cartões, faturas, crédito e investimentos fictícios. Este painel chama apenas a API sandbox da Polp.
          Nenhum lançamento é gravado nas finanças do Zelo e nenhum banco real é conectado.
        </p>
      </div>

      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}
      {notice && <div role="status" className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">{notice}</div>}

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="font-semibold text-slate-900">1. Criar conexão fictícia</h2>
        <p className="my-2 text-sm text-slate-500">Escolha um banco de pessoa física e crie um consentimento de teste, sem custo.</p>
        <div className="flex flex-wrap items-center gap-3">
          <select value={selectedInstitution} onChange={event => setSelectedInstitution(event.target.value)}
            aria-label="Instituição para o teste"
            className="min-w-64 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900">
            <option value="">Selecione a instituição</option>
            {institutions.filter(item => item.type === "PERSONAL" || item.type === "BOTH")
              .map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          {nextInstitutions && <button type="button" disabled={loading} onClick={moreInstitutions}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 disabled:opacity-50">Mais bancos</button>}
          <button type="button" disabled={loading || !selectedInstitution} onClick={createTest}
            className="rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {loading ? "Aguarde..." : "Criar teste sandbox"}
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="font-semibold text-slate-900">2. Conexões de teste</h2>
        {!consents.length && <p className="mt-3 text-sm text-slate-500">Nenhum teste criado nesta conta.</p>}
        <div className="mt-3 space-y-2">
          {consents.map(item => (
            <button key={item.id} type="button" disabled={loading} onClick={() => loadAccounts(item.id)}
              className="flex w-full flex-wrap justify-between gap-2 rounded-xl border border-slate-200 p-3 text-left text-sm hover:bg-slate-50 disabled:opacity-50">
              <span>{institutions.find(bank => bank.id === item.institution_id)?.name || "Instituição"} · {item.id.slice(0, 8)}</span>
              <span className="font-medium text-green-700">{item.status} · {item.execution_status || "sincronizando"}</span>
            </button>
          ))}
        </div>
      </section>

      {selectedConsent && <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold text-slate-900">3. Contas e saldos fictícios</h2>
          <button type="button" disabled={loading} onClick={() => loadAccounts(selectedConsent)}
            className="text-sm font-medium text-green-700 disabled:opacity-50">Atualizar contas</button>
        </div>
        <div className="mt-3 flex items-center gap-3 text-sm">
          <label htmlFor="polp-mode">Comparar com</label>
          <select id="polp-mode" value={mode} onChange={event => setMode(event.target.value as "personal" | "business")}
            className="rounded-lg border border-slate-300 px-2 py-1">
            <option value="personal">Finanças pessoais</option><option value="business">Finanças da empresa</option>
          </select>
          <span className="text-slate-500">Clique em Atualizar contas após mudar o modo.</span>
        </div>
        <div className="mt-3 space-y-3">
          {accounts.map(account => (
            <div key={account.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-4">
              <div>
                <p className="font-medium text-slate-900">Conta •••{account.number?.slice(-4) || "—"}</p>
                <p className="text-xs text-slate-500">{account.type} · agência {account.branch_code || "—"}</p>
              </div>
              <div className="flex items-center gap-4">
                <span className="font-semibold text-slate-900">{currency(account.balance?.available_amount)}</span>
                <button type="button" disabled={loading} onClick={() => loadTransactions(account.id)}
                  className="text-sm font-medium text-green-700 disabled:opacity-50">Ver extrato</button>
              </div>
            </div>
          ))}
        </div>
      </section>}

      {snapshot && <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="font-semibold text-slate-900">Cartões e outros dados encontrados</h2>
        <p className="mt-2 text-sm text-slate-600">
          {snapshot.cards.length} cartões · {snapshot.bills.length} faturas · {snapshot.loans.length} empréstimos · {snapshot.financings.length} financiamentos · {Object.values(snapshot.investments).reduce((sum, items) => sum + items.length, 0)} investimentos
        </p>
        <p className="mt-2 text-sm text-slate-600">{snapshot.resources.map(item => `${item.type}: ${item.status}`).join(" · ") || "Recursos em sincronização"}</p>
        {snapshot.cards.map(card => <div key={card.id} className="mt-3 rounded-xl bg-slate-50 p-3 text-sm">
          <strong>{card.name}</strong> · {card.credit_card_network || "Bandeira não informada"}
          <span className="ml-3">{snapshot.cardTransactions.filter(item => item.cardId === card.id).length} lançamentos</span>
        </div>)}
        <h3 className="mt-5 font-semibold text-slate-900">Conferência de duplicados</h3>
        <p className="mt-1 text-sm text-slate-600">
          {snapshot.comparedWithZelo ? "Comparado com os lançamentos do usuário de teste configurado no servidor." : "Configure POLP_SANDBOX_TEST_USER_ID para comparar com os lançamentos de um usuário de teste do Zelo."}
          {" "}Pagamentos de fatura não viram compras novamente. Coincidências pedem revisão.
        </p>
        <div className="mt-3 max-h-96 divide-y divide-slate-100 overflow-y-auto">
          {[...snapshot.accountTransactions.map(item => ({ id: `account:${item.accountId}:${item.id}`, name: item.transaction_name, amount: item.transaction_amount, date: item.transaction_date_time })),
            ...snapshot.cardTransactions.map(item => ({ id: `card:${item.cardId}:${item.id}`, name: item.transaction_name, amount: item.brazilian_amount, date: item.transaction_date_time }))]
            .map(item => { const match = snapshot.reconciliation.find(row => row.sourceId === item.id);
              return <div key={item.id} className="flex flex-wrap justify-between gap-3 py-3 text-sm">
                <span>{item.name} · {item.date?.slice(0, 10)} · {currency(item.amount)}</span>
                <span className={match?.status === "review" ? "text-amber-700" : "text-slate-600"}>{match?.reason || "Conferir"}</span>
              </div>; })}
        </div>
      </section>}

      {selectedAccount && <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="font-semibold text-slate-900">4. Extrato fictício</h2>
        <div className="mt-3 divide-y divide-slate-100">
          {transactions.map(item => (
            <div key={item.id} className="flex justify-between gap-4 py-3 text-sm">
              <div>
                <p className="font-medium text-slate-900">{item.transaction_name}</p>
                <p className="text-xs text-slate-500">{new Date(item.transaction_date_time).toLocaleDateString("pt-BR")} · {item.category_ref || "Sem categoria"}</p>
              </div>
              <span className={item.credit_debit_type === "CREDITO" ? "text-green-700" : "text-slate-900"}>
                {item.credit_debit_type === "DEBITO" ? "−" : "+"}{currency(item.transaction_amount)}
              </span>
            </div>
          ))}
        </div>
      </section>}
    </div>
  );
}
