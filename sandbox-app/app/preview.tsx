"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import type { PolpConsent, PolpInstitution, PolpPage, PolpRecord, PolpSnapshot } from "@/lib/polp-sandbox";
import { formatPolpDate } from "@/lib/polp-date";
import { applyPreviewAction, money, previewRows, type PreviewLedger, type PreviewRow } from "./preview-model";
import { CreditView, InvestmentsView, CardsView, DetailDialog } from "./preview-views";

const apiPath = "/api/admin/polp-sandbox";
type View = "accounts" | "cards" | "investments" | "credit" | "connections" | "review" | "movements";
const views:{id:View;label:string;icon:string}[] = [
  {id:"accounts",label:"Contas",icon:"wallet"},{id:"movements",label:"Movimentações",icon:"chart"},
  {id:"cards",label:"Cartões e faturas",icon:"card"},{id:"investments",label:"Investimentos",icon:"chart"},
  {id:"credit",label:"Empréstimos e financiamentos",icon:"bank"},{id:"review",label:"Conferência",icon:"check"},
  {id:"connections",label:"Conexões bancárias",icon:"bank"},
];
const titles:Record<View,string> = {accounts:"Contas",cards:"Cartões e faturas",investments:"Investimentos",credit:"Empréstimos e financiamentos",connections:"Conexões bancárias",review:"Conferência de lançamentos",movements:"Movimentações"};

export function Icon({name}:{name:string}) {
  const paths:Record<string,string> = {wallet:"M3 7h16v12H3V5h13 M15 11h6v5h-6z",chart:"M4 19h16 M7 15V9 M12 15V5 M17 15v-3",card:"M3 5h18v14H3z M3 10h18 M6 15h3",bank:"M3 9l9-6 9 6H3 M5 11v7 M12 11v7 M19 11v7 M3 21h18",check:"M5 12l4 4L19 6",plus:"M12 5v14 M5 12h14",arrow:"M5 12h14 M14 7l5 5-5 5",refresh:"M20 7v5h-5 M4 17v-5h5 M5 8a8 8 0 0113-3l2 2 M19 16A8 8 0 016 19l-2-2"};
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="preview-icon"><path d={paths[name] || paths.wallet}/></svg>;
}

async function api<T>(query:string,body?:object):Promise<T> {
  const response = await fetch(`${apiPath}${query}`,{cache:"no-store",...(body ? {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)} : {})});
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Não foi possível carregar os dados de teste.");
  return data;
}

export default function Preview() {
  const [view,setView] = useState<View>("accounts");
  const [institutions,setInstitutions] = useState<PolpInstitution[]>([]);
  const [cursor,setCursor] = useState<string|null>(null);
  const [consents,setConsents] = useState<PolpConsent[]>([]);
  const [selected,setSelected] = useState("");
  const [snapshot,setSnapshot] = useState<PolpSnapshot|null>(null);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState("");
  const [notice,setNotice] = useState("");
  const [updated,setUpdated] = useState("");
  const [ledger,setLedger] = useState<PreviewLedger>({});
  const [query,setQuery] = useState("");
  const [page,setPage] = useState(0);
  const [connect,setConnect] = useState(false);
  const [bank,setBank] = useState("");
  const [step,setStep] = useState(0);
  const [detail,setDetail] = useState<{title:string;record:PolpRecord}|null>(null);
  const [accountFilter,setAccountFilter] = useState("");

  useEffect(()=>{
    let cancelled = false;
    async function load() {
      try {
        const [banks,connections] = await Promise.all([api<PolpPage<PolpInstitution>>("?action=institutions"),api<PolpPage<PolpConsent>>("?action=consents")]);
        if (cancelled) return;
        setInstitutions(banks.data); setCursor(banks.meta?.next_cursor || null);
        const own = connections.data.filter(item=>item.cliente_user_id === "zelo-admin-sandbox");
        setConsents(own);
        const first = own.find(item=>item.status === "AUTHORISED");
        if (first) {
          setSelected(first.id);
          const data = await api<PolpSnapshot>(`?action=snapshot&consentId=${encodeURIComponent(first.id)}`);
          if (!cancelled) {setSnapshot(data);setUpdated(new Date().toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}));}
        }
      } catch(cause) {if (!cancelled) setError(cause instanceof Error ? cause.message : "Falha na conexão de teste.");}
      finally {if (!cancelled) setLoading(false);}
    }
    void load(); return ()=>{cancelled=true;};
  },[]);

  async function loadSnapshot(consentId:string) {
    setLoading(true);setError("");setSelected(consentId);setAccountFilter("");
    // A failed switch must never show the old bank's data under the new bank name.
    setSnapshot(null);
    try {setSnapshot(await api<PolpSnapshot>(`?action=snapshot&consentId=${encodeURIComponent(consentId)}`));setUpdated(new Date().toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}));}
    catch(cause) {setError(cause instanceof Error ? cause.message : "Falha ao atualizar.");}
    finally {setLoading(false);}
  }
  async function createConnection() {
    setLoading(true);setError("");
    try {
      const result = await api<{data:PolpConsent}>("",{institutionId:bank});
      setConsents(items=>[result.data,...items.filter(item=>item.id!==result.data.id)]);
      setConnect(false);setStep(0);setView("accounts");
      await loadSnapshot(result.data.id);
      setNotice("Conexão de teste pronta. Você pode explorar todos os dados fictícios.");
    } catch(cause) {setError(cause instanceof Error ? cause.message : "Não foi possível criar o teste.");}
    finally {setLoading(false);}
  }
  async function moreBanks() {
    if (!cursor) return;
    setLoading(true);setError("");
    try {const result=await api<PolpPage<PolpInstitution>>(`?action=institutions&cursor=${encodeURIComponent(cursor)}`);setInstitutions(items=>[...items,...result.data]);setCursor(result.meta?.next_cursor || null);}
    catch(cause) {setError(cause instanceof Error ? cause.message : "Não foi possível listar bancos.");}
    finally {setLoading(false);}
  }

  const rows = useMemo(()=>snapshot ? previewRows(snapshot) : [],[snapshot]);
  const filtered = rows.filter(row=>(!accountFilter || row.id.startsWith(`account:${accountFilter}:`)) && `${row.name} ${row.origin}`.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR")));
  const displayRows = filtered.slice(page*20,(page+1)*20);
  const currentConsent = consents.find(item=>item.id === selected);
  const bankName = institutions.find(item=>item.id === currentConsent?.institution_id)?.name || "Banco conectado";
  const bankBalances = snapshot?.accounts.map(item=>item.balance?.available_amount).filter(amount=>amount?.currency === "BRL" && Number.isFinite(Number(amount.amount))) || [];
  const balance = bankBalances.reduce((sum,amount)=>sum+Number(amount!.amount),0);
  const investmentCount = Object.values(snapshot?.investments || {}).reduce((sum,items)=>sum+items.length,0);
  const accepted = rows.filter(row=>ledger[row.id] === "imported").length;

  function navigate(next:View) {setView(next);setQuery("");setPage(0);setAccountFilter("");setNotice("");}
  function act(row:PreviewRow,action:"import"|"link"|"ignore") {setLedger(current=>applyPreviewAction(current,row,action));}

  return <div className="preview-shell">
    <aside className="preview-sidebar">
      <div className="preview-brand"><Image src="/brand/zelo-wordmark.png" alt="Zelo" width={160} height={73} unoptimized/><span>Gestão inteligente</span></div>
      <div className="preview-owner"><span className="preview-avatar">M</span><div><strong>Sua prévia privada</strong><span>Acesso do proprietário</span></div></div>
      <p className="preview-nav-label">FINANCEIRO</p>
      <nav aria-label="Financeiro">{views.map(item=><button key={item.id} onClick={()=>navigate(item.id)} className={view === item.id ? "active" : ""}><Icon name={item.icon}/>{item.label}{item.id === "review" && rows.some(row=>row.status === "review" && !ledger[row.id]) && <span className="preview-dot"/>}</button>)}</nav>
      <div className="preview-sidebar-bottom"><span className="preview-lock">Acesso privado</span><p>Dados fictícios para testar a experiência da Zelo.</p><a href="/diagnostico">Abrir painel de diagnóstico</a></div>
    </aside>
    <main className="preview-main">
      <div className="preview-topbar"><span>Financeiro <span className="preview-slash">/</span> {titles[view]}</span><span className="preview-badge">Brasil · Prévia privada</span></div>
      <div className="preview-banner"><span><strong>Você está na prévia.</strong> Todos os valores são fictícios. As decisões de importação são simuladas e reiniciam ao atualizar a página.</span>{Object.keys(ledger).length>0 && <button onClick={()=>{setLedger({});setNotice("Simulação reiniciada.");}}>Reiniciar simulação</button>}</div>
      <header className="preview-heading"><div><p className="preview-eyebrow">SUAS FINANÇAS, MAIS CONECTADAS</p><h1>{titles[view]}</h1><p>Contas, cartões e investimentos organizados em um só lugar.</p></div><button className="preview-primary" onClick={()=>{setConnect(true);setStep(0);setBank("");}}><Icon name="plus"/>Conectar banco</button></header>
      {error && <div role="alert" className="preview-error">{error}</div>}
      {notice && <div role="status" className="preview-notice">{notice}</div>}
      <section className="preview-stats" aria-label="Resumo da conexão">
        <button onClick={()=>navigate("accounts")}><span className="preview-stat-icon"><Icon name="wallet"/></span><span>Disponível nos bancos</span><strong>{loading ? "Carregando…" : bankBalances.length ? money(balance) : "Não informado"}</strong><small>{snapshot?.accounts.length || 0} contas · saldo bancário em BRL</small></button>
        <button onClick={()=>navigate("cards")}><span className="preview-stat-icon"><Icon name="card"/></span><span>Cartões conectados</span><strong>{snapshot?.cards.length || 0}</strong><small>{snapshot?.bills.length || 0} faturas disponíveis</small></button>
        <button onClick={()=>navigate("investments")}><span className="preview-stat-icon"><Icon name="chart"/></span><span>Investimentos</span><strong>{investmentCount}</strong><small>Posições e movimentações</small></button>
        <button onClick={()=>navigate("credit")}><span className="preview-stat-icon"><Icon name="bank"/></span><span>Operações de crédito</span><strong>{(snapshot?.loans.length || 0)+(snapshot?.financings.length || 0)}</strong><small>Empréstimos e financiamentos</small></button>
      </section>
      {loading && <div role="status" className="preview-loading"><span className="preview-spinner"/>Buscando todos os dados da conexão de teste…</div>}
      {!loading && snapshot && <>
        <section className="preview-connection"><div className="preview-bank-icon"><Icon name="bank"/></div><div className="preview-connection-name"><strong>{bankName}</strong><span><i/>Conectado · consulta da prévia às {updated}</span></div><button className="preview-secondary" onClick={()=>void loadSnapshot(selected)}><Icon name="refresh"/>Atualizar dados</button></section>
        {view === "accounts" && <>
          <div className="preview-section-heading"><h2>Suas contas</h2><button onClick={()=>navigate("connections")}>Gerenciar conexões <Icon name="arrow"/></button></div>
          <div className="preview-account-grid">{snapshot.accounts.map(account=><article key={account.id} className="preview-account"><div className="preview-account-top"><span className="preview-bank-icon"><Icon name="bank"/></span><span className="preview-tag green">Conectada</span></div><h3>{bankName}</h3><p>Agência {account.branch_code || "—"} · Conta •••{account.number?.slice(-4) || "—"}</p><span className="preview-small-label">Saldo disponível</span><strong className="preview-account-balance">{money(account.balance?.available_amount)}</strong><button className="preview-link" onClick={()=>{navigate("movements");setAccountFilter(account.id);}}>Ver extrato <Icon name="arrow"/></button></article>)}<article className="preview-account manual"><div className="preview-account-top"><span className="preview-bank-icon"><Icon name="wallet"/></span><span className="preview-tag">Manual</span></div><h3>Dinheiro</h3><p>Dinheiro em espécie · conta de exemplo</p><span className="preview-small-label">Saldo fictício</span><strong className="preview-account-balance">{money(200)}</strong><p className="preview-footnote">Suas contas manuais continuam disponíveis junto das contas conectadas.</p></article></div>
          {Object.values(snapshot.reservedBalances).flat().length>0 && <><div className="preview-section-heading"><h2>Saldos reservados</h2><span>Exibidos separadamente do saldo disponível</span></div><div className="preview-account-grid">{Object.values(snapshot.reservedBalances).flat().map((record,index)=><article key={String(record.id || index)} className="preview-account"><h3>{String(record.reserved_name || "Reserva")}</h3><p>Reserva informada pelo banco</p>{(Array.isArray(record.available_amount) ? record.available_amount : []).map((amount,i)=><strong key={i} className="preview-account-balance">{money(amount)}</strong>)}<button className="preview-link" onClick={()=>setDetail({title:String(record.reserved_name || "Reserva"),record})}>Ver detalhes <Icon name="arrow"/></button></article>)}</div></>}
          <div className="preview-next"><div><strong>Confira antes de adicionar às suas finanças</strong><p>A Zelo separa compras, pagamentos e possíveis lançamentos repetidos.</p></div><button className="preview-primary" onClick={()=>navigate("review")}>Conferir lançamentos <Icon name="arrow"/></button></div>
        </>}
        {view === "cards" && <CardsView snapshot={snapshot} onDetail={(title,record)=>setDetail({title,record})}/>}
        {view === "investments" && <InvestmentsView snapshot={snapshot} onDetail={(title,record)=>setDetail({title,record})}/>}
        {view === "credit" && <CreditView snapshot={snapshot} onDetail={(title,record)=>setDetail({title,record})}/>}
        {(view === "movements" || view === "review") && <section className="preview-table-card">
          <div className="preview-section-heading"><div><h2>{view === "review" ? "Revisar e simular importação" : "Extrato da conexão"}</h2><p>{view === "review" ? "Um exemplo fictício de compra pela IA está incluído para testar o vínculo." : "Entradas, saídas e compras do cartão, com suas origens."}</p></div><span className="preview-tag">{accepted} adicionados na simulação</span></div>
          <div className="preview-table-toolbar"><input aria-label="Buscar lançamento" placeholder="Buscar lançamento ou origem…" value={query} onChange={event=>{setQuery(event.target.value);setPage(0);}}/>{accountFilter && <button className="preview-secondary" onClick={()=>{setAccountFilter("");setPage(0);}}>Mostrar todas as contas</button>}{view === "review" && <button className="preview-primary" onClick={()=>{setLedger(current=>rows.reduce((next,row)=>applyPreviewAction(next,row,"import"),current));setNotice("Importação simulada: só os itens novos foram adicionados nesta prévia. Possíveis duplicados continuam aguardando conferência.");}}>Simular importação dos novos</button>}</div>
          <div className="preview-table-scroll"><table><thead><tr><th>Lançamento</th><th>Data</th><th>Valor</th><th>Conferência</th>{view === "review" && <th>Ação na prévia</th>}</tr></thead><tbody>{displayRows.map(row=><tr key={row.id}><td><strong>{row.name}</strong><small>{row.origin}{row.installment ? ` · Parcela ${row.installment}` : ""}</small></td><td>{formatPolpDate(row.date)}</td><td className={row.credit ? "preview-income" : ""}>{row.credit ? "+ " : "− "}{money(row.amount)}</td><td><span className={`preview-tag ${row.status === "review" ? "amber" : row.status === "new" ? "green" : ""}`}>{ledger[row.id] === "imported" ? "Adicionado na prévia" : ledger[row.id] === "linked" ? "Vinculado na prévia" : ledger[row.id] === "ignored" ? "Ignorado na prévia" : row.status === "review" ? "Conferir" : row.status === "payment_or_transfer" ? "Pagamento / transferência" : "Novo"}</span><small>{row.reason}</small></td>{view === "review" && <td>{!ledger[row.id] && <div className="preview-row-actions">{row.status === "new" && <button onClick={()=>act(row,"import")}>Adicionar</button>}{row.status === "review" && row.matchingFinanceIds.length>0 && <button onClick={()=>act(row,"link")}>Vincular ao exemplo da IA</button>}<button onClick={()=>act(row,"ignore")}>Ignorar</button></div>}</td>}</tr>)}</tbody></table></div>
          {!filtered.length && <p className="preview-empty">Nenhum lançamento encontrado.</p>}
          <div className="preview-pagination"><span>{filtered.length} lançamentos · página {page+1} de {Math.max(1,Math.ceil(filtered.length/20))}</span><button disabled={page===0} onClick={()=>setPage(value=>value-1)}>Anterior</button><button disabled={(page+1)*20>=filtered.length} onClick={()=>setPage(value=>value+1)}>Próxima</button></div>
        </section>}
      </>}
      {view === "connections" && <section className="preview-table-card"><div className="preview-section-heading"><div><h2>Bancos conectados</h2><p>Escolha uma conexão para consultar seus dados fictícios.</p></div></div>{consents.map(consent=><div key={consent.id} className="preview-connection-row"><div><strong>{institutions.find(item=>item.id===consent.institution_id)?.name || "Instituição"}</strong><span>{consent.status === "AUTHORISED" ? "Autorizado" : "Aguardando autorização"} · ambiente de teste</span></div><button className="preview-secondary" disabled={loading || consent.status !== "AUTHORISED"} onClick={()=>{setView("accounts");void loadSnapshot(consent.id);}}>Ver dados</button></div>)}<p className="preview-footnote">A autorização bancária real e a desconexão serão adicionadas no fluxo de produção.</p></section>}
      {!loading && !snapshot && view !== "connections" && <section className="preview-empty-card"><Icon name="bank"/><h2>Experimente conectar um banco</h2><p>Veja como contas, cartões, investimentos e crédito vão aparecer na Zelo.</p><button className="preview-primary" onClick={()=>setConnect(true)}>Criar conexão de teste</button>{selected && <button className="preview-secondary" onClick={()=>void loadSnapshot(selected)}>Tentar carregar novamente</button>}</section>}
      <footer className="preview-footer">Open Finance disponível somente no Brasil · Prévia privada com dados fictícios · Nenhuma gravação nas finanças atuais</footer>
    </main>
    {connect && <div className="preview-modal-backdrop"><section role="dialog" aria-modal="true" aria-labelledby="connect-title" className="preview-modal"><button className="preview-modal-close" aria-label="Fechar conexão" disabled={loading} onClick={()=>setConnect(false)}>×</button><span className="preview-tag">Conexão de teste</span><h2 id="connect-title">{step === 0 ? "Qual banco você quer conectar?" : "Autorizar compartilhamento"}</h2><p>{step === 0 ? "Escolha uma instituição para explorar a experiência com dados fictícios." : "Na versão real, você será encaminhado ao banco para autorizar esses dados."}</p>{step === 0 ? <><label htmlFor="preview-bank">Instituição</label><select id="preview-bank" value={bank} onChange={event=>setBank(event.target.value)}><option value="">Selecione seu banco</option>{institutions.filter(item=>item.type === "PERSONAL" || item.type === "BOTH").map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select>{cursor && <button className="preview-link" disabled={loading} onClick={()=>void moreBanks()}>Carregar mais bancos</button>}<button className="preview-primary full" disabled={!bank || loading} onClick={()=>setStep(1)}>Continuar <Icon name="arrow"/></button></> : <><div className="preview-permissions">{["Contas, saldos e extratos","Cartões, compras e faturas","Investimentos e movimentações","Empréstimos e financiamentos"].map(label=><div key={label}><Icon name="check"/>{label}</div>)}</div><p className="preview-footnote">Este teste usa uma identidade fictícia. Nenhuma senha, CPF real ou autorização bancária é solicitada.</p><button className="preview-primary full" disabled={loading} onClick={()=>void createConnection()}>{loading ? "Preparando dados…" : "Continuar com dados de teste"}</button><button className="preview-secondary full" disabled={loading} onClick={()=>setStep(0)}>Voltar</button></>}{error && <p role="alert" className="preview-error">{error}</p>}</section></div>}
    {detail && <DetailDialog title={detail.title} record={detail.record} onClose={()=>setDetail(null)}/>}
  </div>;
}
