import Image from "next/image";
import { memo, type ReactNode } from "react";
import UiIcon from "@/components/UiIcon";
import s from "./landing.module.css";

function Chat({ children, compact = false }: { children: ReactNode; compact?: boolean }) {
  return <div className={`${s.phone} ${compact ? s.compactPhone : ""}`}>
    <div className={s.phoneStatus}><span>9:41</span><span className={s.phoneIsland} /><span>● ▰</span></div>
    <div className={s.chatHeader}><span className={s.avatar}><Image src="/brand/zelo-icon.png" width={24} height={24} alt="" /></span><div><b>Zelo</b><small>Seu assistente no WhatsApp</small></div><span className={s.online} /></div>
    <div className={s.chatMessages}><span className={s.today}>HOJE</span>{children}</div>
    <div className={s.chatInput}><span>＋</span><span>Mensagem</span><UiIcon name="spark" /></div>
  </div>;
}

function Bubble({ children, outgoing = false }: { children: ReactNode; outgoing?: boolean }) {
  return <div className={`${s.bubble} ${outgoing ? s.outgoing : ""}`}>{children}<small>09:41 {outgoing ? "✓✓" : ""}</small></div>;
}

function Voice() {
  return <div className={s.voice}><span className={s.play}>▶</span><div className={s.wave}>{[12, 24, 18, 32, 22, 38, 28, 16, 30, 40, 22, 34, 16, 26, 36, 20, 30, 16, 24, 12].map((height, index) => <i key={index} style={{ height }} />)}</div><small>0:08</small></div>;
}

function Dashboard({ personal = false, complete = false }: { personal?: boolean; complete?: boolean }) {
  return <div className={s.dashboard}>
    <aside className={s.dashSidebar}><Image src="/brand/zelo-icon.png" width={30} height={30} alt="Zelo" />{(["home", "finance", "wallet", "calendar", "task", "folder"] as const).map((name, i) => <span key={name} className={i === 1 ? s.dashActive : ""}><UiIcon name={name} /></span>)}</aside>
    <div className={s.dashMain}>
      <div className={s.dashTop}><span>Visão geral</span><span className={s.spaceBadge}><UiIcon name={personal ? "home" : "business"} />{personal ? "Pessoal" : "Studio Aurora"}⌄</span></div>
      <p className={s.dashGreeting}>Tudo em ordem por aqui.</p>
      <div className={s.stats}><div><small>Saldo disponível</small><b>R$ 8.450<span>,00</span></b><em>↗ Visão do seu dinheiro</em></div><div><small>Despesas do mês</small><b>R$ 2.180<span>,00</span></b><em>Organizadas por categoria</em></div></div>
      <div className={s.chartHeading}><b>Seu mês, em perspectiva</b><span>Outubro ⌄</span></div>
      <div className={s.chart} aria-hidden="true">{[32, 54, 43, 69, 48, 85, 62, 75, 53, 90, 73, 100].map((height, i) => <div key={i}><i style={{ height: `${height}%` }} /><i style={{ height: `${height * 0.65}%` }} /></div>)}</div>
      <div className={s.chartLegend}><span>● Receitas</span><span>● Despesas</span></div>
      {complete ? <div className={s.miniModules}>{([['folder', 'Documentos'], ['target', 'Metas'], ['calendar', 'Agenda'], ['users', 'Equipe']] as const).map(([name, text]) => <span key={name}><UiIcon name={name} />{text}</span>)}</div> : <div className={s.transactions}><b>Últimas movimentações</b><p><span className={s.transactionIcon}><UiIcon name="car" /></span><span>Combustível<small>Empresa · hoje</small></span><strong>− R$ 87,00</strong></p><p><span className={s.transactionIcon}><UiIcon name="client" /></span><span>Pagamento recebido<small>Cliente · hoje</small></span><strong className={s.positive}>+ R$ 1.200,00</strong></p></div>}
    </div>
  </div>;
}

function Conversation() {
  return <><div className={s.orbitLabel}><UiIcon name="spark" />Um áudio já resolve.</div><Chat><Bubble>Bom dia! O que vamos organizar hoje?</Bubble><Bubble outgoing><Voice /></Bubble><div className={s.transcription}><small>SEU ÁUDIO, EM PALAVRAS</small><p>“Zelo, gastei 87 reais de combustível na empresa.”</p></div></Chat><div className={s.floatingNote}><span className={s.successDot}>✓</span><div>Do seu jeito.<small>Sem formulários para preencher.</small></div></div></>;
}

function Registration() {
  return <div className={s.registration}><Chat compact><Bubble outgoing>Gastei <mark>R$ 87</mark> de <mark>combustível</mark> na <mark>empresa</mark>.</Bubble><Bubble>Despesa registrada!<br /><b>R$ 87,00 · Combustível</b><br />No espaço Studio Aurora.</Bubble></Chat><div className={s.receipt}><span className={s.receiptCheck}>✓</span><small>PAINEL ATUALIZADO</small><h3>Mais um detalhe<br />resolvido.</h3><p>Combustível <b>− R$ 87,00</b></p><div><span>Categoria</span><b>Combustível</b></div><div><span>Espaço</span><b>Studio Aurora</b></div><footer><UiIcon name="business" /> Sua vida pessoal segue separada.</footer></div></div>;
}

function Money() {
  return <div className={s.wideVisual}><Dashboard /><div className={s.queryCard}><span className={s.avatar}><UiIcon name="wallet" /></span><div><small>VOCÊ PERGUNTA NO WHATSAPP</small><b>“O que tenho de parcelado?”</b><p>Notebook · parcela 3 de 10<br /><span>7 parcelas previstas pela frente.</span></p></div></div><span className={s.detailTag}>Contas · cartões · faturas · parcelas</span></div>;
}

function Workspaces() {
  return <div className={s.workspaces}><div className={s.workspaceSwitch}><span><UiIcon name="home" /> Pessoal</span><span className={s.selectedSpace}><UiIcon name="business" /> Studio Aurora</span></div><Dashboard /><div className={s.workspaceNote}><span className={s.successDot}>✓</span><div>Empresa selecionada<small>Finanças, arquivos e Google neste espaço.</small></div></div></div>;
}

function Routine() {
  return <div className={s.routine}><div className={s.calendarCard}><div className={s.calendarTop}><Image src="/brand/google-calendar.png" width={27} height={27} alt="Google Agenda" /><span>Uma rotina mais organizada</span></div><div className={s.calendarDate}><span>QUARTA-FEIRA</span><b>21</b><span>OUTUBRO</span></div><div className={s.event}><small>10:00 — 11:00</small><b>Reunião de planejamento</b><span><span className={s.meetIcon}>▰</span> Google Meet · link no compromisso</span></div><div className={s.reminder}><UiIcon name="bell" /><span>Lembrete às 09:45</span><b>✓</b></div><div className={s.taskLine}><UiIcon name="task" /> Preparar a proposta <span>Hoje</span></div></div><div className={s.routineMessage}><span>VOCÊ PEDE</span><p>“Marque a reunião amanhã às 10h e me lembre antes.”</p></div></div>;
}

function Everything() {
  return <div className={s.everything}><Dashboard complete /><div className={s.connectedModules}>{([['folder', 'Drive'], ['target', 'Metas'], ['cart', 'Mercado'], ['car', 'Veículos']] as const).map(([name, label]) => <span key={name}><UiIcon name={name} />{label}</span>)}</div><div className={s.allTogether}><Image src="/brand/zelo-icon.png" width={29} height={29} alt="" /><b>Um assistente.<br /><span>Muitas coisas a menos na cabeça.</span></b></div></div>;
}

const VISUALS = [Conversation, Registration, Money, Workspaces, Routine, Everything];
export default memo(function StoryVisual({ scene }: { scene: number }) {
  const Visual = VISUALS[scene];
  return <Visual />;
});
