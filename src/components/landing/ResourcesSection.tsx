import UiIcon from "@/components/UiIcon";
import FunctionsGuide from "./FunctionsGuide";
import s from "./landing.module.css";

export default function ResourcesSection() {
  return <section id="recursos" className={s.resources}>
    <div className={s.sectionInner}>
      <div className={s.resourceIntro}><p className={s.eyebrow}>DA CONVERSA PARA A VIDA REAL</p><h2>Fale. Resolva.<br /><span>Siga o seu dia.</span></h2><p>O WhatsApp é o começo. No painel, cada informação ganha contexto, histórico e um lugar para você acompanhar.</p></div>
      <article className={s.financeFeature} id="financas">
        <div className={s.featureCopy}><span className={s.featureNumber}>01 / FINANÇAS</span><h3>Seu dinheiro,<br />sem pontos cegos.</h3><p>Registre receitas e despesas por texto, áudio ou documento. Informe a conta e o espaço, consulte por período e categoria e entenda o que entrou, o que saiu e o que vem pela frente.</p><a href="#open-finance">Conheça a conexão com seus bancos <span>↗</span></a><div className={s.featureQuestion}>“Quanto gastei no mercado este mês?”</div></div>
        <div className={s.financeDashboard} role="img" aria-label="Painel financeiro ilustrativo: R$ 4.250 de receitas, R$ 1.730 de despesas, registros por categoria e período. Dados fictícios.">
          <div className={s.dashboardBar}><b>zelo<span> / financeiro</span></b><span>Pessoal ⌄</span></div><div className={s.dashboardTitle}><div><small>SEU DINHEIRO, MAIS CLARO</small><h4>Visão geral</h4></div><span>Este mês ⌄</span></div>
          <div className={s.dashboardMetrics}><div><span>↙ Receitas</span><b>R$ 4.250<small>,00</small></b></div><div><span>↗ Despesas</span><b>R$ 1.730<small>,00</small></b></div></div>
          <div className={s.chartHeader}><b>Como seu mês está andando</b><span><i /> Entradas <i /> Saídas</span></div>
          <div className={s.barChart}>{[40,65,47,85,55,75,95].map((n,i) => <div key={i}><div><i style={{height:`${n}%`}} /><i style={{height:`${n * .57}%`}} /></div><span>{String(i * 4 + 1).padStart(2,"0")}</span></div>)}</div>
          <div className={s.dashboardTransaction}><span><UiIcon name="cart" /></span><div><b>Supermercado</b><small>Débito · Conta pessoal</small></div><strong>− R$ 85,00</strong></div><p className={s.illustration}>PAINEL ILUSTRATIVO · VALORES FICTÍCIOS</p>
        </div>
      </article>
      <article className={s.agendaFeature} id="agenda">
        <div className={s.agendaBoard} role="img" aria-label="Agenda ilustrativa: reunião às 10h com Google Meet, proposta às 14h e lembrete de seguro às 16h."><div className={s.agendaBoardTop}><span><UiIcon name="calendar" /> Sua agenda</span><b>Um dia com espaço.</b></div><div className={s.weekStrip}>{["SEG","TER","QUA","QUI","SEX"].map((day,i) => <div key={day} data-active={i===1}><small>{day}</small><b>{18+i}</b></div>)}</div><div className={s.calendarEvent}><span>10:00</span><div><b>Reunião com a equipe</b><p>Google Meet <i>↗</i></p></div></div><div className={s.calendarEvent}><span>14:00</span><div><b>Enviar proposta</b><p><UiIcon name="task" /> Tarefa · prioridade alta</p></div></div><div className={s.calendarEvent}><span>16:00</span><div><b>Pagar o seguro</b><p><UiIcon name="bell" /> Lembrete no WhatsApp</p></div></div><small className={s.illustration}>EXEMPLO ILUSTRATIVO</small></div>
        <div className={s.featureCopy}><span className={s.featureNumber}>02 / TEMPO E ROTINA</span><h3>Mais presença.<br />Menos “esqueci”.</h3><p>Crie compromissos, defina tarefas e programe lembretes. Conecte o Google Agenda ao espaço certo e peça um link do Meet para a sua próxima reunião.</p><div className={s.agendaIntegrations}><span>Google Agenda</span><span>Google Meet ↗</span><span>WhatsApp</span></div><div className={s.featureQuestion}>“Marque uma reunião amanhã às 10h e crie o link do Meet.”</div><small>Conexão Google com sua autorização. Para atas e resumos, envie o conteúdo por texto ou áudio. Criar o link não grava a reunião automaticamente.</small></div>
      </article>
      <FunctionsGuide />
      <aside className={s.fiscalNote}><UiIcon name="document" /><div><b>Preparação fiscal para empresas</b><p>Cadastre dados fiscais e serviços e prepare rascunhos de NFS-e para revisar. A emissão direta e o PDF oficial aguardam homologação e configuração do emissor. Rascunho não é nota emitida.</p></div><span>EM PREPARAÇÃO</span></aside>
    </div>
  </section>;
}
