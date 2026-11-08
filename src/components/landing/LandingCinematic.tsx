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
    "Se você já usa o WhatsApp, basta vincular o número à Zelo para conversar por lá. Para conferir os lançamentos e ver os gráficos, abra o painel pelo navegador do celular ou do computador.",
  ],
  [
    "Preciso decorar comandos?",
    "Você pode explicar o que precisa com suas palavras. Quando faltarem informações, a Zelo pede os detalhes para continuar. Confira os dados e as confirmações apresentados na conversa.",
  ],
  [
    "Posso usar no pessoal e em mais de uma empresa?",
    "O período da assinatura não muda os recursos. No painel, selecione Pessoal ou, com acesso Empresa habilitado na conta, escolha qual empresa consultar. Cada espaço tem seus próprios registros, permissões e conexões Google.",
  ],
  [
    "Como conecto meus bancos?",
    "Em qualquer um dos três planos, você pode conectar quantos bancos brasileiros compatíveis quiser. No painel, abra Contas e selecione Conectar banco. O titular autoriza o compartilhamento em cada banco. Para uma conta PJ, faça a conexão no espaço da empresa em que você tem permissão.",
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
    "Hoje a Zelo prepara os dados da nota fiscal de serviço (NFS-e). O Otto reúne cliente, serviço e valor, e você confere tudo no painel. A emissão oficial pela Zelo ainda está indisponível.",
  ],
  [
    "Como funciona a compra e a garantia?",
    "A assinatura é paga, com compra pela Hotmart e 7 dias de garantia na primeira compra. Escolha o período e confira as condições de pagamento, parcelamento e assinatura no checkout antes de concluir.",
  ],
] as const;
function Arrow() {
  return <UiIcon name="arrow" />;
}
function BankSection() {
  return (
    <section className={`${s.section} ${s.openFinance}`} id="open-finance" aria-labelledby="titulo-open-finance">
      <div className={s.wrap}>
        <p className={s.sectionLabel}>OPEN FINANCE</p>
        <div className={s.bankIntro} data-scroll-scene="title">
          <h2 id="titulo-open-finance">Consulte suas contas pelo WhatsApp</h2>
          <div>
            <p>
              No painel, abra Contas e escolha <strong>Conectar banco</strong>.
              Selecione a instituição e autorize o compartilhamento no banco.
              Depois, pergunte à Rita pelo WhatsApp “Qual é o saldo das minhas contas?”.
            </p>
            <a href="#dados-bancarios" className={s.textLink}>
              O que posso acompanhar?<span aria-hidden="true">↓</span>
            </a>
          </div>
        </div>
        <div className={s.bankCoverage}>
          <div className={s.bankCoverageDetails}>
            <h3>Quais bancos posso conectar?</h3>
            <p>Nos três planos, você pode conectar quantos bancos brasileiros compatíveis quiser. Para contas PJ, abra o espaço da empresa em que você tem permissão.</p>
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
            <strong>O titular autoriza cada conexão no próprio banco.</strong>{" "}
            A conexão é feita pela Celcoin. A Zelo recebe os dados que a
            instituição disponibiliza e que o titular autorizou compartilhar.{" "}
            <Link href="/privacidade#open-finance" className={s.privacyLink}>Como a Zelo usa seus dados bancários</Link>
          </p>
        </div>
        <PlanLink />
      </div>
    </section>
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
    ["compartilhar", "Família e equipe"],
    ["equipe", "Agentes e funções"],
    ["modo-empresa", "Modo Empresa"],
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
              <p>Abra o painel pelo navegador. No gráfico, compare o que entrou e saiu no mês. No extrato, confira as compras uma a uma.</p>
            </div>
            <ProductDevicePreview />
            <PlanLink />
          </div>
        </section>
        <BankSection />
        <SharedLife />
        <AgentFunctionSections
          detailsByAgent={{
            finance: <a href="#open-finance" className={s.sectionLink}>Ver como a Rita consulta seus bancos <Arrow /></a>,
            support: <a href="#compartilhar" className={s.sectionLink}>Ver como compartilhar o acesso <Arrow /></a>,
          }}
        />
        <WorkspaceJourney />
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
              <a href="#open-finance">Open Finance</a>
              <a href="#compartilhar">Família e equipe</a>
              <a href="#equipe">Agentes e funções</a>
              <a href="#modo-empresa">Modo Empresa</a>
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
