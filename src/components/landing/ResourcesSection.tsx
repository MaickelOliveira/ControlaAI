import UiIcon from "@/components/UiIcon";
import FunctionsGuide from "./FunctionsGuide";
import ProductCapture from "./ProductCapture";
import s from "./landing.module.css";
import x from "./experience.module.css";

export default function ResourcesSection() {
  return <section id="recursos" className={x.resourcesExperience}>
    <div className={x.experienceIntro}><p className={s.eyebrow}>MENOS PENDÊNCIAS NA CABEÇA. MAIS PRESENÇA NO DIA.</p><h2>O cuidado aparece<br /><em>nos pequenos detalhes.</em></h2><p>Na compra que você anotou. No compromisso que não esqueceu. No arquivo que encontrou quando precisava. Veja o Zelo funcionando na sua rotina.</p></div>
    <article className={x.realScene} id="financas">
      <div className={x.sceneEditorial}><div><span className={x.sceneIndex}>01 / SEU DINHEIRO</span><h2>Você lembra do momento.<br /><em>O Zelo guarda o detalhe.</em></h2></div><div><p>O gasto aconteceu. Você conta no WhatsApp e ele ganha valor, categoria, conta e espaço. Depois, o painel reúne os registros para você entender o mês e planejar o próximo passo.</p><a href="#funcoes">Veja o que mais você pode organizar <span>↗</span></a></div></div>
      <ProductCapture src="/brand/product/dashboard-demo.webp" title="Seu dia, sob controle" alt="Captura da dashboard real da Zelo com números fictícios: saldo R$ 18.450, entradas R$ 12.850, saídas R$ 8.250 e resultado R$ 4.600; gráfico do período e crédito disponível." />
      <ol className={x.sceneSteps}><li><span>01</span><h3>Conte o que aconteceu</h3><p>“Gastei R$ 85 no mercado, no débito, na conta pessoal.” Texto, áudio ou documento entram na conversa.</p></li><li><span>02</span><h3>Complete o que faltar</h3><p>Informe a conta, o espaço e os detalhes solicitados. Faturas e planilhas podem ser revisadas antes de confirmar a importação.</p></li><li><span>03</span><h3>Entenda o seu mês</h3><p>Consulte por período, categoria e conta. No painel, veja os lançamentos e os gráficos que ajudam a explicar os valores.</p></li></ol>
    </article>
    <article className={`${x.realScene} ${x.agendaScene}`} id="agenda">
      <div className={x.sceneEditorial}><div><span className={x.sceneIndex}>02 / SEU TEMPO</span><h2>Pode focar no agora.<br /><em>O próximo passo tem lugar.</em></h2></div><div><p>Uma reunião, uma entrega, algo que você não quer esquecer. Organize data e horário na conversa, conecte o Google Agenda ao espaço escolhido e peça um link do Meet quando precisar.</p><div className={x.integrationRow}><span>Google Agenda</span><span>Google Meet</span><span>WhatsApp</span></div></div></div>
      <ProductCapture src="/brand/product/agenda-demo.webp" title="Agenda que acompanha o seu dia" width={1740} height={904} alt="Captura da agenda real da Zelo, preenchida somente na imagem com seis compromissos fictícios em outubro, incluindo reunião com a equipe e revisão de proposta." />
      <div className={x.agendaNarrative}><div><UiIcon name="calendar" /><h3>O compromisso fica visível</h3><p>“Marque uma reunião terça, às 10h.” Complete o assunto e o espaço e acompanhe no calendário.</p></div><div><UiIcon name="bell" /><h3>O aviso chega na hora</h3><p>Programe um lembrete com data e horário para receber a mensagem no WhatsApp quando precisar.</p></div><div><UiIcon name="document" /><h3>O que foi decidido continua</h3><p>Envie o conteúdo por áudio ou texto para organizar resumo e tarefas. Criar o link do Meet não grava a reunião.</p></div></div>
      <p className={x.sceneFootnote}>Conexão Google com sua autorização. Os compromissos desta captura são de demonstração; nenhum evento real foi criado.</p>
    </article>
    <FunctionsGuide />
    <aside className={s.fiscalNote}><UiIcon name="document" /><div><b>Preparação fiscal para empresas</b><p>Cadastre dados fiscais e serviços e prepare rascunhos de NFS-e para revisar. A emissão direta e o PDF oficial aguardam homologação e configuração do emissor. Rascunho não é nota emitida.</p></div><span>EM PREPARAÇÃO</span></aside>
  </section>;
}
