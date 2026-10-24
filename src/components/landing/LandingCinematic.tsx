"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import UiIcon, { type UiIconName } from "@/components/UiIcon";
import s from "./cinematic.module.css";
import CinematicHero from "./CinematicHero";
import BankConnections from "./BankConnections";
import { usePageScrollMotion } from "./PageScrollMotion";
import AgentShowcase from "./AgentShowcase";
import PricingSection from "./PricingSection";
import WorkspaceJourney from "./WorkspaceJourney";
import SharedLife from "./SharedLife";
import {
  PresentationMotion,
  usePresentationMotion,
} from "./PresentationMotion";

const BANK_DATA: { icon: UiIconName; title: string; copy: string }[] = [
  {
    icon: "wallet",
    title: "Contas e saldos",
    copy: "Uma visão das contas conectadas.",
  },
  {
    icon: "finance",
    title: "Movimentações",
    copy: "Entradas e saídas recebidas dos bancos.",
  },
  {
    icon: "document",
    title: "Cartões e faturas",
    copy: "Compras, vencimentos e limites informados.",
  },
  {
    icon: "repeat",
    title: "Compras parceladas",
    copy: "Parcelas identificadas e previsões disponíveis.",
  },
  {
    icon: "target",
    title: "Investimentos",
    copy: "Posições e valores compartilhados.",
  },
  {
    icon: "business",
    title: "Empréstimos e crédito",
    copy: "Contratos e saldos devedores recebidos.",
  },
];
const FAQS = [
  [
    "Preciso instalar mais um aplicativo?",
    "Não para conversar com a Zelo: você usa o WhatsApp. O painel web complementa a experiência para visualizar, conferir e organizar suas informações no celular ou computador.",
  ],
  [
    "Preciso decorar comandos?",
    "Você pode explicar o que precisa com suas palavras. Quando faltarem informações, a Zelo pede os detalhes para continuar. Confira os dados e as confirmações apresentados na conversa.",
  ],
  [
    "Posso usar no pessoal e em mais de uma empresa?",
    "Sim. A Zelo tem um espaço Pessoal e espaços separados para suas empresas. Os registros, acessos e conexões Google seguem o espaço escolhido. Quando houver mais de uma empresa, escolha em qual delas realizar o pedido.",
  ],
  [
    "Como conecto meus bancos?",
    "Com o recurso disponível na sua conta, abra Contas → Conectar banco, escolha a instituição e conclua a autorização no banco. A conexão utiliza a Celcoin. Você não fornece sua senha bancária à Zelo. O Open Finance atende contas brasileiras e depende do plano, do acesso ao espaço e dos dados disponibilizados pela instituição.",
  ],
  [
    "Posso incluir minha família, sócios ou equipe?",
    "Sim. Vincule as pessoas à conta para que cada uma converse individualmente com a Zelo pelo próprio WhatsApp. Nas configurações, você pode ajustar o acesso ao Pessoal, ao Empresarial ou aos dois modos, além de remover um número vinculado. Os lançamentos enviados pelo WhatsApp podem mostrar o nome cadastrado de quem os registrou.",
  ],
  [
    "A integração Google grava minhas reuniões?",
    "A conexão permite usar a agenda e criar links do Google Meet com sua autorização. Criar um link não grava nem transcreve a reunião automaticamente. Para organizar resumo, decisões ou tarefas, envie o conteúdo por texto ou áudio.",
  ],
  [
    "A Zelo já emite nota fiscal?",
    "Você pode organizar dados fiscais, cadastrar serviços e preparar rascunhos de NFS-e. A emissão direta e o PDF oficial ainda aguardam homologação e configuração do emissor. Rascunho não é nota fiscal emitida.",
  ],
  [
    "Como funciona a compra e a garantia?",
    "A assinatura é paga, com compra pela Hotmart e 7 dias de garantia na primeira compra. Escolha o período e confira as condições de pagamento, parcelamento e assinatura no checkout antes de concluir.",
  ],
] as const;
function Arrow() {
  return <UiIcon name="arrow" />;
}
function SectionLabel({
  number,
  children,
}: {
  number: string;
  children: React.ReactNode;
}) {
  return (
    <p className={s.sectionLabel}>
      <span>{number}</span>
      {children}
    </p>
  );
}

export default function LandingCinematic({ fontClass }: { fontClass: string }) {
  return (
    <PresentationMotion>
      <LandingContent fontClass={fontClass} />
    </PresentationMotion>
  );
}

function LandingContent({ fontClass }: { fontClass: string }) {
  const { running, reduced, toggle } = usePresentationMotion();
  const [menuOpen, setMenuOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  usePageScrollMotion(root);
  const menuButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        menuButton.current?.focus();
      }
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [menuOpen]);
  const nav = [
    ["como-funciona", "Como funciona"],
    ["open-finance", "Open Finance"],
    ["equipe", "Seu time"],
    ["planos", "Planos"],
  ];
  return (
    <div
      ref={root}
      className={`${fontClass} ${s.page}`}
      data-motion={running ? "running" : "paused"}
    >
      <a className={s.skip} href="#conteudo">
        Pular para o conteúdo
      </a>
      <header className={s.header}>
        <div className={s.headerInner}>
          <a href="#inicio" className={s.brand} aria-label="Zelo, início">
            <Image
              src="/brand/zelo-wordmark-light.png"
              alt="Zelo"
              width={108}
              height={49}
              priority
            />
            <span>IA no WhatsApp.</span>
          </a>
          <nav className={s.nav} aria-label="Navegação principal">
            {nav.map(([id, label]) => (
              <a key={id} href={`#${id}`}>
                {label}
              </a>
            ))}
          </nav>
          <div className={s.headerActions}>
            <button
              type="button"
              className={s.motionButton}
              onClick={toggle}
              disabled={reduced}
              aria-pressed={!running}
              aria-label={running ? "Pausar animações" : "Ativar animações"}
              title={
                reduced
                  ? "Movimento reduzido ativado no dispositivo"
                  : running
                    ? "Pausar animações"
                    : "Ativar animações"
              }
            >
              {running ? "Ⅱ" : "▷"}
            </button>
            <Link href="/login" className={s.login}>
              Entrar
              <Arrow />
            </Link>
            <a href="#planos" className={s.headerCta}>
              Quero meu Zelo
            </a>
            <button
              ref={menuButton}
              type="button"
              className={s.menuToggle}
              aria-expanded={menuOpen}
              aria-controls="menu-zelo"
              aria-label={menuOpen ? "Fechar menu" : "Abrir menu"}
              onClick={() => setMenuOpen((value) => !value)}
            >
              <span aria-hidden="true">{menuOpen ? "×" : "☰"}</span>
            </button>
          </div>
        </div>
        {menuOpen && (
          <nav
            className={s.mobileNav}
            id="menu-zelo"
            aria-label="Navegação móvel"
          >
            {nav.map(([id, label]) => (
              <a key={id} href={`#${id}`} onClick={() => setMenuOpen(false)}>
                {label}
                <Arrow />
              </a>
            ))}
          </nav>
        )}
      </header>
      <main id="conteudo">
        <CinematicHero />
        <div className={s.marquee} aria-hidden="true">
          <div>
            {Array.from({ length: 4 }, (_, i) => (
              <span key={i}>
                VOCÊ VIVE. <em>A ZELO ORGANIZA.</em> ✦{" "}
              </span>
            ))}
          </div>
        </div>
        <section className={`${s.section} ${s.overview}`} id="painel">
          <div className={s.wrap}>
            <div className={s.sectionHead} data-scroll-scene="title">
              <div>
                <SectionLabel number="01">
                  O WHATSAPP É O COMEÇO. O PAINEL É A VISÃO COMPLETA.
                </SectionLabel>
                <h2>
                  Sua vida organizada.
                  <br />À vista, de verdade.
                </h2>
              </div>
              <p>
                O que você organiza na conversa ganha espaço na plataforma. Veja
                suas finanças, filtre os lançamentos, acompanhe compromissos e
                encontre documentos. No computador ou no celular.
              </p>
            </div>
            <figure className={s.productFigure} data-scroll-scene="panel">
              <div className={s.browserBar}>
                <span aria-hidden="true">● ● ●</span>
                <span>SEU PAINEL ZELO</span>
                <span>
                  <UiIcon name="finance" />
                  Tudo à vista
                </span>
              </div>
              <picture>
                <source
                  media="(max-width: 650px)"
                  srcSet="/brand/product/mobile-demo.webp"
                  width={853}
                  height={1844}
                />
                <Image
                  src="/brand/product/dashboard-demo.webp"
                  alt="Painel da Zelo com visão financeira, entradas, saídas, gráfico e crédito por conta. Valores ilustrativos."
                  width={1687}
                  height={932}
                  sizes="(max-width:1280px) 92vw, 1200px"
                />
              </picture>
              <figcaption>
                Interface da Zelo com informações de demonstração.
              </figcaption>
            </figure>
          </div>
        </section>
        <section className={`${s.section} ${s.openFinance}`} id="open-finance">
          <div className={s.wrap}>
            <SectionLabel number="02">
              OPEN FINANCE + IA NO WHATSAPP
            </SectionLabel>
            <div className={s.bankIntro} data-scroll-scene="title">
              <h2>
                Seu dinheiro conectado.
                <br />
                <em>Sua IA bem informada.</em>
              </h2>
              <div>
                <p>
                  “Quanto eu tenho parcelado?” “Qual é o saldo das minhas
                  contas?” Conecte seus bancos pelo Open Finance e pergunte à IA
                  no WhatsApp. Ela consulta os dados recebidos para ajudar você
                  a entender seu dinheiro.
                </p>
                <a href="#dados-bancarios" className={s.textLink}>
                  O que posso acompanhar?<span aria-hidden="true">↓</span>
                </a>
              </div>
            </div>
            <div className={s.bankCoverage}>
              <p className={s.bankCoverageMetric}>
                <strong>210</strong>
                <span>
                  opções de conexão
                  <br />
                  bancária no catálogo
                </span>
              </p>
              <div className={s.bankCoverageDetails}>
                <h3>Para você. Para sua empresa.</h3>
                <p>
                  Bancos e instituições com conexões para contas pessoais (PF)
                  e empresariais (PJ).
                </p>
                <p className={s.bankCoverageNote}>
                  Catálogo Polp/Celcoin consultado em 24/10/2026. Inclui opções
                  PF e PJ da mesma instituição. A disponibilidade pode variar.{" "}
                  <a
                    href="https://api.polp.com.br/api/v2/institutions"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Conferir catálogo <span aria-hidden="true">↗</span>
                  </a>
                </p>
              </div>
            </div>
            <BankConnections />
            <div className={s.bankGrid} id="dados-bancarios">
              {BANK_DATA.map((item) => (
                <article key={item.title}>
                  <UiIcon name={item.icon} />
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.copy}</p>
                  </div>
                </article>
              ))}
            </div>
            <div className={s.bankConsent}>
              <div className={s.consentIcon}>
                <UiIcon name="person" />
              </div>
              <p>
                <strong>A autorização é sua.</strong> A conexão é feita pela
                Celcoin, com autorização no banco. A Zelo não pede sua senha
                bancária. Disponível para contas brasileiras, conforme plano,
                acesso e dados compartilhados pela instituição.
              </p>
            </div>
          </div>
        </section>
        <WorkspaceJourney />
        <SharedLife />
        <AgentShowcase />
        <PricingSection />
        <section className={`${s.section} ${s.faq}`} id="duvidas">
          <div className={`${s.wrap} ${s.faqGrid}`} data-scroll-scene="faq">
            <div>
              <SectionLabel number="06">ANTES DE COMEÇAR</SectionLabel>
              <h2>
                Alguma dúvida
                <br />
                por aí?
              </h2>
              <p>Vamos deixar tudo claro.</p>
            </div>
            <div>
              {FAQS.map(([question, answer]) => (
                <details key={question}>
                  <summary>
                    {question}
                    <span aria-hidden="true">+</span>
                  </summary>
                  <p>{answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
        <section className={s.closing}>
          <div
            className={`${s.wrap} ${s.closingInner}`}
            data-scroll-scene="closing"
          >
            <p>
              UM POUCO MAIS DE ORDEM.
              <br />
              UM TANTO MAIS DE LEVEZA.
            </p>
            <h2>
              Seu próximo passo?
              <br />
              Uma mensagem.
            </h2>
            <a className={s.darkButton} href="#planos">
              Quero começar
              <Arrow />
            </a>
          </div>
        </section>
      </main>
      <footer className={s.footer}>
        <div className={s.wrap}>
          <div className={s.footerTop}>
            <div>
              <Image
                src="/brand/zelo-wordmark-light.png"
                alt="Zelo"
                width={130}
                height={60}
              />
              <p>
                Gestão inteligente.
                <br />
                Uma conversa de cada vez.
              </p>
            </div>
            <nav aria-label="Links do rodapé">
              <a href="#como-funciona">Como funciona</a>
              <a href="#recursos">Recursos</a>
              <a href="#equipe">Equipe virtual</a>
              <a href="#planos">Planos</a>
              <Link href="/login">Entrar na Zelo</Link>
            </nav>
            <nav aria-label="Informações legais">
              <Link href="/privacidade">Privacidade</Link>
              <Link href="/termos">Termos de uso</Link>
              <a href="mailto:contato@zelogestaointeligente.com.br">
                Fale com a Zelo
                <Arrow />
              </a>
            </nav>
          </div>
          <div className={s.footerBottom}>
            <span>
              © {new Date().getFullYear()} Zelo. Todos os direitos reservados.
            </span>
            <span>Inteligência que acompanha você.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
