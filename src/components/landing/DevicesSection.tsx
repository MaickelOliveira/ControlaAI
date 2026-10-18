import Image from "next/image";
import UiIcon from "@/components/UiIcon";
import s from "./landing.module.css";
import x from "./experience.module.css";

export default function DevicesSection() {
  return <section id="em-todo-lugar" className={x.devicesSection}>
    <div className={x.devicesHeading}><p className={s.eyebrow}>NO CELULAR. NO NOTEBOOK. NA SUA ROTINA.</p><h2>Na palma da mão.<br /><em>Na tela inteira.</em></h2><p>No caminho, uma mensagem resolve o registro. Na hora de olhar os detalhes, o painel acompanha você no celular ou no computador.</p></div>
    <div className={x.devicePair} role="img" aria-label="A mesma plataforma Zelo aberta em um notebook e em um celular, com valores fictícios de demonstração.">
      <div className={x.deviceBackdrop} aria-hidden="true">seu dia,<br /><b>conectado.</b></div>
      <div className={x.laptop}><div className={x.laptopScreen}><i /><Image src="/brand/product/dashboard-demo.webp" alt="Dashboard Zelo no notebook, com saldos, entradas, saídas, gráficos e cartões" width={1687} height={932} unoptimized /></div><div className={x.laptopBase}><i /></div><div className={x.laptopShadow} /></div>
      <div className={x.realMobile}><div className={x.realMobileSpeaker} /><Image src="/brand/product/mobile-demo.webp" alt="Painel Zelo adaptado ao celular com os mesmos valores de demonstração" width={853} height={1844} unoptimized /><div className={x.mobileHomeIndicator} /></div>
    </div>
    <div className={x.deviceBenefits}><div><UiIcon name="spark" /><h3>Peça pelo WhatsApp</h3><p>Texto, áudio ou documento para registrar um gasto, pedir uma tarefa ou organizar um compromisso.</p></div><div><UiIcon name="finance" /><h3>Veja no painel</h3><p>Gráficos, histórico, arquivos e detalhes, com espaço para entender o que está acontecendo.</p></div><div><UiIcon name="home" /><h3>Use onde estiver</h3><p>O painel web se adapta ao celular e ao notebook. Sua conta e o contexto escolhido acompanham o acesso.</p></div></div>
    <p className={x.deviceDemoNote}>Telas da plataforma com dados fictícios. O WhatsApp é o canal de conversa; o painel web é acessado pelo navegador.</p>
  </section>;
}
