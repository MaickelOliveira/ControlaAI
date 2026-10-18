"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import UiIcon from "@/components/UiIcon";
import { storyFrame, expenseJourney, EXPENSE_EXAMPLE_MESSAGE as MESSAGE } from "@/lib/landing-story";
import ZeloCore from "./ZeloCore";
import s from "./landing.module.css";

const STEP_PROGRESS = [0.08, 0.57, 0.97];
const STEPS = [
  { title: "Digite o pedido", description: "A mensagem aparece conforme você rola: um gasto de R$ 85 no mercado, pago no débito, no espaço pessoal." },
  { title: "Siga o caminho", description: "Entre na conversa e acompanhe as informações: valor, categoria, conta e espaço seguem para a organização do gasto." },
  { title: "Veja o registro", description: "O pedido se transforma em um registro financeiro. No uso real, complete os dados solicitados e acompanhe o resultado no seu painel." },
];
const clamp = (value: number) => Math.min(1, Math.max(0, value));

export default function ProductHero() {
  const root = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState(() => storyFrame(-1, { top: 0, height: 1, viewport: 1 }, 3));
  const [enhanced, setEnhanced] = useState(false);
  const [webgl, setWebgl] = useState(false);

  useEffect(() => {
    const section = root.current;
    if (!section) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let request = 0;
    const measure = () => {
      request = 0;
      setWebgl(!motion.matches);
      const useScroll = !motion.matches && window.innerHeight >= 640 && !(window.innerWidth < 768 && window.innerHeight < 740);
      setEnhanced(useScroll);
      if (useScroll) {
        const box = section.getBoundingClientRect();
        const next = storyFrame(window.scrollY, { top: box.top + window.scrollY - 72, height: box.height, viewport: stage.current?.offsetHeight ?? window.innerHeight }, 3);
        setFrame(previous => previous.position === next.position && previous.progress === next.progress ? previous : next);
      }
    };
    const schedule = () => { if (!request) request = requestAnimationFrame(measure); };
    const observer = new ResizeObserver(schedule);
    observer.observe(section);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    motion.addEventListener("change", schedule);
    schedule();
    return () => {
      cancelAnimationFrame(request);
      observer.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      motion.removeEventListener("change", schedule);
    };
  }, []);

  function goToStep(index: number) {
    if (!root.current) return;
    const box = root.current.getBoundingClientRect();
    const geometry = { top: box.top + window.scrollY - 72, height: box.height, viewport: stage.current?.offsetHeight ?? window.innerHeight };
    if (enhanced) window.scrollTo({ top: geometry.top + STEP_PROGRESS[index] * Math.max(1, geometry.height - geometry.viewport), behavior: "smooth" });
    else setFrame(storyFrame(STEP_PROGRESS[index] * 100, { top: 0, height: 100, viewport: 0 }, 3));
  }

  const progress = enhanced ? frame.progress : [0, 0.58, 1][frame.active];
  const journey = expenseJourney(progress);
  const typing = enhanced ? journey.typing : 1;
  const { zoom, travel, reveal } = journey;
  const typed = enhanced ? journey.typed : MESSAGE;
  const processing = progress >= 0.38;
  const routeOpacity = clamp(travel * 5) * (1 - reveal);
  const receiptVisible = reveal > 0;

  return <section ref={root} id="inicio" className={s.productHero} data-enhanced={enhanced} data-product-step={frame.active} data-flight={travel.toFixed(3)} data-record={reveal.toFixed(3)} aria-label="Conheça o Zelo">
    <span id="como-funciona" />
    <div ref={stage} className={s.productStage}>
      <div className={s.productTop}><span><i /> SUA VIDA. SEU NEGÓCIO. TUDO EM ORDEM.</span><span>GESTÃO INTELIGENTE PELO WHATSAPP</span></div>
      <div className={s.productGrid}>
        <div className={s.productCopy} inert={zoom > 0.85} aria-hidden={zoom > 0.85} style={{ opacity: 1 - zoom, transform: `translateX(${-zoom * 35}px)`, visibility: processing ? "hidden" : "visible" }}>
          <p className={s.eyebrow}>SUA ROTINA, EM OUTRA FREQUÊNCIA</p>
          <h1>Seu mundo,<br /><em>em ordem<span>↗</span></em></h1>
          <p className={s.productLead}>Finanças, agenda, tarefas e documentos. Uma conversa no WhatsApp conecta tudo — para você ter mais tempo de viver.</p>
          <div className={s.heroActions}><a href="#planos" className={s.primaryButton}>Quero meu Zelo <UiIcon name="arrow" /></a><a href="#recursos" className={s.productExplore}>Explorar as funções <span>↓</span></a></div>
          <div className={s.productAssurance}><span><UiIcon name="finance" /> Open Finance</span><span><UiIcon name="home" /> Pessoal + empresas</span></div>
        </div>
        <div className={s.processingCopy} aria-hidden={!processing} inert={!processing} style={{ opacity: clamp((progress - 0.38) / 0.12), visibility: processing ? "visible" : "hidden" }}>
          <p className={s.eyebrow}>{receiptVisible ? "DA CONVERSA PARA O SEU FINANCEIRO" : "ACOMPANHE O CAMINHO DO SEU PEDIDO"}</p>
          <h2>{receiptVisible ? <>Um gasto.<br /><em>Cada detalhe<br />no lugar.</em></> : <>Uma mensagem.<br /><em>A organização<br />acontece.</em></>}</h2>
          <p>{receiptVisible ? "Valor, categoria, forma de pagamento e espaço reunidos em um registro. Depois, consulte pela conversa ou acompanhe os detalhes no painel." : "O valor é identificado. O contexto ganha forma. A informação segue para o lugar certo, sem você precisar procurar onde anotar."}</p>
          <div className={s.processingFields}><span data-done={travel > .12}>R$ 85,00</span><span data-done={travel > .38}>Supermercado</span><span data-done={travel > .65}>Pessoal</span></div>
          <a href={receiptVisible ? "#open-finance" : "#recursos"} className={s.productExplore}>{receiptVisible ? "Conhecer o Open Finance" : "Explorar as funções"} <span>↓</span></a>
        </div>
        <div className={s.productShowcase} role="img" aria-label={`Demonstração ilustrativa: ${STEPS[frame.active].title}. ${MESSAGE}. ${receiptVisible ? "Exemplo de gasto registrado em supermercado, no débito e no espaço Pessoal." : "A mensagem percorre o caminho até a organização do gasto."}`}>
          <div className={s.productCanvas}>
            <div className={s.productCore} aria-hidden="true" style={{ opacity: .85 * (1 - reveal * .7) }}><ZeloCore position={progress * 6} enabled={webgl} /></div>
            <div className={s.productHalo} aria-hidden="true"><span>menos<br /><b>caos.</b></span></div><div className={s.floatingAgenda} aria-hidden="true" style={{ opacity: 1 - zoom }}><UiIcon name="calendar" /><div><small>SUA AGENDA EM DIA</small><b>Reunião com a equipe</b><span>Amanhã · 10:00</span></div><i>↗</i></div>
            <div className={s.showcaseDevice} aria-hidden="true" style={{ opacity: 1 - clamp(travel * 1.8), transform: `perspective(1400px) translateX(${-zoom * 105}px) translateY(${-zoom * 42}px) scale(${1 + zoom * .65}) rotateY(${-12 + zoom * 12}deg) rotateZ(${-5 + zoom * 5}deg)` }}>
              <div className={s.deviceStatus}><span>9:41</span><i /><span>● ▰</span></div>
              <div className={s.deviceHeader}><Image src="/brand/zelo-icon.png" alt="" width={36} height={36} /><div><b>Zelo</b><small>Gestão inteligente</small></div><span>⋯</span></div>
              <div className={s.deviceConversation}>
                <span className={s.demoPill}>EXEMPLO ILUSTRATIVO</span>
                <div className={s.deviceWelcome}>O que vamos organizar hoje?</div>
                <div className={s.deviceRequest}><span>{typed}</span>{typing < 1 && <i className={s.typingCaret} />}<small>09:41 {typing >= 1 ? "✓✓" : "· digitando"}</small></div>
                <div className={s.deviceReply} style={{ opacity: clamp((typing - .72) / .28) }}><b>Zelo</b>R$ 85 em supermercado, no débito e no espaço Pessoal. Vamos organizar esse gasto.<small>09:41</small></div>
              </div>
              <div className={s.deviceInput}><span>+</span><div>{typing < 1 ? "Digitando sua mensagem…" : "Mensagem enviada"}</div><UiIcon name="arrow" /></div>
              <div className={s.deviceKeyboard}>{["qwertyuiop", "asdfghjkl", "zxcvbnm"].map(row => <div key={row}>{row.split("").map(letter => <span key={letter} data-active={typing < 1 && typed.at(-1)?.toLowerCase() === letter}>{letter}</span>)}</div>)}<div><span>123</span><b>espaço</b><span>↵</span></div></div>
            </div>
            <div className={s.expenseRoute} aria-hidden="true" style={{ opacity: routeOpacity }}>
              <svg viewBox="0 0 620 600" fill="none"><path d="M365 247 C235 120 75 190 110 340 S340 550 455 375" stroke="#171a18" strokeOpacity=".15" strokeWidth="1" /><path d="M365 247 C235 120 75 190 110 340 S340 550 455 375" pathLength="1" stroke="#746400" strokeWidth="2" strokeDasharray="1" strokeDashoffset={1 - travel} /><circle cx="365" cy="247" r="5" fill="#171a18" /><circle cx="455" cy="375" r="5" fill="#171a18" /></svg>
              <div className={s.expensePacket} style={{ offsetDistance: `${travel * 100}%` }}><UiIcon name="wallet" /><b>R$ 85</b></div>
              <span className={s.routeValue} data-reached={travel > .12}>01 / VALOR IDENTIFICADO</span><span className={s.routeCategory} data-reached={travel > .38}>02 / CATEGORIA ORGANIZADA</span><span className={s.routeSpace} data-reached={travel > .65}>03 / ESPAÇO PESSOAL</span>
            </div>
            <div className={s.expenseReceipt} aria-hidden="true" style={{ opacity: reveal, visibility: receiptVisible ? "visible" : "hidden", transform: `translateY(${(1 - reveal) * 35}px) scale(${.9 + reveal * .1})` }}>
              <div className={s.expenseReceiptHeader}><span>✓</span><div><small>SEU PEDIDO CHEGOU AO LUGAR CERTO</small><b>Gasto organizado</b></div><UiIcon name="document" /></div>
              <strong>R$ 85<span>,00</span></strong><p>Supermercado</p>
              <dl><div><dt>Categoria</dt><dd>Supermercado</dd></div><div><dt>Pagamento</dt><dd>Débito</dd></div><div><dt>Conta</dt><dd>Conta pessoal</dd></div><div><dt>Espaço</dt><dd>Pessoal</dd></div></dl>
              <div className={s.receiptDestination}><UiIcon name="finance" /><span>No seu financeiro<small>Consulte no painel e na conversa</small></span><b>↗</b></div>
              <small className={s.receiptIllustration}>EXEMPLO ILUSTRATIVO · DADOS FICTÍCIOS</small>
            </div>
            <div className={s.productConnection} aria-hidden="true" style={{ opacity: 1 - zoom }}><span /><p>R$ 85,00<b>Um gasto. Tudo no lugar.</b></p><UiIcon name="spark" /></div>
            <span className={s.productSideLabel} aria-hidden="true">ZELO / ORGANIZAÇÃO EM MOVIMENTO</span>
          </div>
        </div>
      </div>
      <div className={s.productBottom}>
        <nav className={s.productSteps} aria-label="Etapas da demonstração">{STEPS.map((item, i) => <button key={item.title} type="button" onClick={() => goToStep(i)} aria-current={frame.active === i ? "step" : undefined}><span>0{i + 1}</span><b>{item.title}</b><i /></button>)}</nav>
        <p className={s.productStepDescription}>{STEPS[frame.active].description}</p>
        <a href="#open-finance" className={s.productScroll}>Role para acompanhar <span>↓</span></a>
      </div>
      <div className={s.progress} aria-hidden="true"><span style={{ transform: `scaleX(${frame.progress})` }} /></div>
    </div>
  </section>;
}
