"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import UiIcon, { type UiIconName } from "@/components/UiIcon";
import {
  BRAZIL_CHECKOUT,
  checkoutUrlWithLandingParams,
} from "@/lib/checkout-markets";
import s from "./cinematic.module.css";
import CinematicHero from "./CinematicHero";
import BankConnections from "./BankConnections";
import AgentShowcase from "./AgentShowcase";
import ConversationJourney from "./ConversationJourney";
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
const PLANS = [
  {
    id: "monthly",
    name: "Mensal",
    prefix: "",
    price: "47",
    cents: ",00",
    suffix: "/mês",
    total: "Pagamento mensal",
    value: 47,
    label: "Um passo de cada vez",
  },
  {
    id: "semiannual",
    name: "Semestral",
    prefix: "6x",
    price: "36",
    cents: ",96",
    suffix: "",
    total: "ou R$ 197,00 à vista",
    value: 197,
    label: "Para criar uma nova rotina",
  },
  {
    id: "annual",
    name: "Anual",
    prefix: "12x",
    price: "30",
    cents: ",72",
    suffix: "",
    total: "ou R$ 297,00 à vista",
    value: 297,
    label: "Seu ano mais organizado",
  },
] as const;
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
    "Posso usar com minha família ou equipe?",
    "Sim. Vincule as pessoas à conta para que usem seus próprios números de WhatsApp, conforme os acessos disponíveis. Os registros ficam no contexto pessoal ou empresarial correspondente.",
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

function Spaces() {
  const [active, setActive] = useState(0);
  const spaces = [
    {
      name: "Pessoal",
      icon: "person",
      detail: "Sua vida, suas prioridades.",
      request: "Quanto gastei com supermercado este mês?",
      items: ["Finanças pessoais", "Agenda e metas", "Arquivos e lembretes"],
    },
    {
      name: "Estúdio Aurora",
      icon: "business",
      detail: "O dia a dia do seu negócio.",
      request: "Marque a reunião do Estúdio Aurora para amanhã às 10h.",
      items: ["Financeiro da empresa", "Clientes e equipe", "Google do espaço"],
    },
    {
      name: "Loja Central",
      icon: "business",
      detail: "Outro negócio. Outro espaço.",
      request: "Registre uma despesa de R$ 120 na Loja Central.",
      items: [
        "Contas da Loja Central",
        "Acessos da empresa",
        "Registros separados",
      ],
    },
  ] as const;
  const chosen = spaces[active];
  return (
    <section className={s.spaces} id="espacos">
      <div className={`${s.wrap} ${s.spacesGrid}`}>
        <div>
          <SectionLabel number="04">CADA COISA NO SEU LUGAR</SectionLabel>
          <h2>
            Você pode ter
            <br />
            muitos papéis.
            <br />
            <em>E um só Zelo.</em>
          </h2>
          <p>
            A vida pessoal, a primeira empresa, o próximo negócio. Cada espaço
            tem seus registros, suas conexões e seus acessos.
          </p>
          <div className={s.spaceRule}>
            <UiIcon name="business" />
            <span>
              Mais de uma empresa?
              <br />
              <strong>A Zelo pergunta em qual delas agir.</strong>
            </span>
          </div>
        </div>
        <div className={s.spaceDemo}>
          <p className={s.spaceDemoLabel}>
            EXPLORE OS ESPAÇOS <span>Exemplo ilustrativo</span>
          </p>
          <div
            className={s.spaceButtons}
            role="group"
            aria-label="Exemplo de espaço"
          >
            {spaces.map((space, index) => (
              <button
                type="button"
                key={space.name}
                aria-pressed={active === index}
                onClick={() => setActive(index)}
              >
                <UiIcon name={space.icon} />
                {space.name}
                <span aria-hidden="true">{active === index ? "✓" : "↗"}</span>
              </button>
            ))}
          </div>
          <div className={s.spaceContent} aria-live="polite" key={active}>
            <span className={s.spaceIcon}>
              <UiIcon name={chosen.icon} />
            </span>
            <h3>{chosen.detail}</h3>
            <p>“{chosen.request}”</p>
            <ul>
              {chosen.items.map((item) => (
                <li key={item}>
                  <span aria-hidden="true">✓</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

function Plans() {
  return (
    <section className={`${s.section} ${s.plans}`} id="planos">
      <div className={s.wrap}>
        <div className={s.plansIntro}>
          <SectionLabel number="05">SEU PRÓXIMO PASSO</SectionLabel>
          <h2>
            Escolha seu ritmo.
            <br />
            <em>Comece a se organizar.</em>
          </h2>
          <p>
            Os mesmos recursos disponíveis em todos os períodos.
            <br />
            Escolha como prefere pagar.
          </p>
        </div>
        <div className={s.planGrid}>
          {PLANS.map((plan) => (
            <article
              key={plan.id}
              className={`${s.plan} ${plan.id === "annual" ? s.featuredPlan : ""}`}
            >
              {plan.id === "annual" && (
                <span className={s.planBadge}>MENOR VALOR POR MÊS</span>
              )}
              <p className={s.planName}>{plan.name}</p>
              <p className={s.planTagline}>{plan.label}</p>
              <div className={s.price}>
                {plan.prefix && (
                  <span className={s.installments}>{plan.prefix}</span>
                )}
                <span>R$</span>
                <strong>{plan.price}</strong>
                <span>
                  {plan.cents}
                  <small>{plan.suffix}</small>
                </span>
              </div>
              <p className={s.planTotal}>{plan.total}</p>
              <a
                href={BRAZIL_CHECKOUT.checkoutUrls[plan.id]}
                onClick={(event) => {
                  event.currentTarget.href = checkoutUrlWithLandingParams(
                    BRAZIL_CHECKOUT.checkoutUrls[plan.id],
                    window.location.search,
                  );
                }}
                data-meta-plan={plan.id}
                data-meta-value={plan.value}
                className={s.planButton}
                aria-label={`Escolher plano ${plan.name.toLowerCase()} — comprar na Hotmart`}
              >
                Escolher {plan.name.toLowerCase()}
                <Arrow />
              </a>
              <ul>
                {[
                  "Equipe virtual no WhatsApp",
                  "Painel web no celular e computador",
                  "Organização pessoal e empresarial",
                  "Finanças, agenda, tarefas e arquivos",
                  "Uso compartilhado conforme os acessos",
                ].map((item) => (
                  <li key={item}>
                    <span aria-hidden="true">✓</span>
                    {item}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
        <div className={s.guarantee}>
          <span className={s.guaranteeSeal}>
            7<small>DIAS</small>
          </span>
          <div>
            <strong>Tempo para conhecer a Zelo.</strong>
            <p>
              7 dias de garantia na primeira compra. Pagamento pela Hotmart.
            </p>
          </div>
        </div>
        <p className={s.planFine}>
          Confira as condições de pagamento e parcelamento no checkout. Recursos
          bancários dependem do plano, das instituições conectadas e dos dados
          compartilhados. Emissão direta de NFS-e em preparação.
        </p>
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
        <ConversationJourney />
        <section className={`${s.section} ${s.overview}`} id="painel">
          <div className={s.wrap}>
            <div className={s.sectionHead}>
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
            <figure className={s.productFigure}>
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
            <div className={s.bankIntro}>
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
        <Spaces />
        <AgentShowcase />
        <Plans />
        <section className={`${s.section} ${s.faq}`} id="duvidas">
          <div className={`${s.wrap} ${s.faqGrid}`}>
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
          <div className={`${s.wrap} ${s.closingInner}`}>
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
