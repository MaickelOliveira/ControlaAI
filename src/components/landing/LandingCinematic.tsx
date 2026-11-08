"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import UiIcon, { type UiIconName } from "@/components/UiIcon";
import s from "./cinematic.module.css";
import { CookiePreferencesButton } from "@/components/MetaTracking";
import CinematicHero from "./CinematicHero";
import BankConnections from "./BankConnections";
import { usePageScrollMotion } from "./PageScrollMotion";
import AgentFunctionSections from "./AgentFunctionSections";
import PlanLink from "./PlanLink";
import PricingSection from "./PricingSection";
import ProductDevicePreview from "./ProductDevicePreview";
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
    "Sua conta tem um espaço Pessoal. Com acesso empresarial, cada empresa habilitada tem seu próprio espaço. Os registros, acessos e conexões Google seguem o espaço escolhido. Quando houver mais de uma empresa, escolha em qual delas realizar o pedido.",
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
function FinanceExamples() {
  return (
    <div className={s.extraExamples}>
      <details className={s.demoDetails}>
        <summary>Como a Rita consulta seus bancos <span aria-hidden="true">+</span></summary>
        <section className={`${s.section} ${s.openFinance}`} id="open-finance">
          <div className={s.wrap}>
            <p className={s.sectionLabel}>OPEN FINANCE</p>
            <div className={s.bankIntro} data-scroll-scene="title">
              <h2>
                Consulte suas contas pelo WhatsApp
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
              <div className={s.bankCoverageDetails}>
                <h3>Quais bancos posso conectar?</h3>
                <p>Consulte as instituições disponíveis para contas pessoais e empresariais.</p>
              </div>
              <Link href="/bancos" className={s.textLink}>
                Consultar bancos <Arrow />
              </Link>
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
                acesso e dados compartilhados pela instituição.{" "}
                <Link href="/privacidade#open-finance" className={s.privacyLink}>Como a Zelo usa seus dados bancários</Link>
              </p>
            </div>
            <PlanLink />
          </div>
        </section>
      </details>
      <Link href="/bancos" className={s.catalogLink}>Consultar bancos disponíveis <Arrow /></Link>
    </div>
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
    ["equipe", "Agentes e funções"],
    ["duvidas", "Dúvidas"],
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
              Ver planos
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
            <Link href="/login" className={s.mobileLogin}>Entrar na Zelo <Arrow /></Link>
          </nav>
        )}
      </header>
      <main id="conteudo">
        <CinematicHero />
        <section className={`${s.section} ${s.overview}`} id="painel" aria-labelledby="titulo-painel">
          <div className={s.wrap}>
            <div className={s.sectionHead}>
              <h2 id="titulo-painel">Seu painel no celular e no computador</h2>
              <p>Abra a Zelo pelo navegador para ver seu saldo, consultar as compras e acompanhar o mês em qualquer uma das telas.</p>
            </div>
            <ProductDevicePreview />
            <PlanLink />
          </div>
        </section>
        <AgentFunctionSections
          detailsByAgent={{
            finance: <FinanceExamples />,
            support: (
              <div className={s.extraExamples}>
                <details className={s.demoDetails}>
                  <summary>Como alternar entre o Pessoal e a Empresa <span aria-hidden="true">+</span></summary>
                  <WorkspaceJourney />
                </details>
                <details className={s.demoDetails}>
                  <summary>Como compartilhar o acesso com a família ou a equipe <span aria-hidden="true">+</span></summary>
                  <SharedLife />
                </details>
              </div>
            ),
          }}
        />
        <PricingSection />
        <section className={`${s.section} ${s.faq}`} id="duvidas">
          <div className={`${s.wrap} ${s.faqGrid}`} data-scroll-scene="faq">
            <div>
              <h2>Perguntas frequentes</h2>
              <PlanLink />
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
            <h2>
              Comece a organizar sua rotina pelo WhatsApp.
            </h2>
            <a className={s.darkButton} href="#planos">
              Ver planos
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
              <a href="#equipe">Agentes e funções</a>
              <Link href="/bancos">Bancos disponíveis</Link>
              <a href="#planos">Planos</a>
              <Link href="/login">Entrar na Zelo</Link>
            </nav>
            <nav aria-label="Informações legais">
              <Link href="/privacidade">Privacidade</Link>
              <Link href="/termos">Termos de uso</Link>
              <CookiePreferencesButton />
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
